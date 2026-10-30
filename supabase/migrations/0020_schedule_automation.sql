-- 0020 · Schedule automation and holidays (step 1: what the website can do reliably)
--
-- Rules agreed with the owner (October 2026):
--  * Staff can always check in themselves, early or late.
--  * Automatic check-in (Pro, Premium, trial): once someone has checked in cleanly on their last
--    5 check-in days, and the app has seen them at their approved place today, 5ime checks them in
--    at work start if they haven't — recorded at the time it FIRST saw them there (e.g. 7:30).
--    A red flag (out of range, wrong place, weak GPS, left without approval) pauses it until they
--    have 5 clean days again. Admins can switch it off for the company or for one person.
--  * Before closing time, stepping out changes nothing.
--  * Closing time, overtime off (every plan): everyone still checked in is checked out at closing time.
--  * Closing time, overtime on (Pro, Premium, trial): outside at closing → checked out at closing;
--    still inside → may keep working; leaving later → checked out at the time last seen inside;
--    never later than the company's latest overtime time.
--  * Holidays: Nigerian public holidays for everyone; company holidays on Pro and Premium.
--    On a holiday nobody is late or absent, there is no automatic check-in, and work is marked.
--  * Privacy: only times and the kind of place (office / home / approved place) are kept for
--    sightings, never coordinates, and they are deleted after 90 days.
-- Night shifts (work end before work start) are left to manual check-in and check-out.

-- ── settings
alter table public.organizations add column if not exists auto_check_in boolean not null default true;
alter table public.organizations add column if not exists auto_check_out boolean not null default true;
alter table public.organizations add column if not exists overtime_allowed boolean not null default false;
alter table public.organizations add column if not exists overtime_until time not null default '21:00';
grant update (auto_check_in, auto_check_out, overtime_allowed, overtime_until) on public.organizations to authenticated;
alter table public.members add column if not exists auto_check_in_off boolean not null default false;

-- ── where the app has seen someone today (times only)
create table if not exists public.presence_days (
  member_id       uuid not null references public.members on delete cascade,
  org_id          uuid not null references public.organizations on delete cascade,
  local_date      date not null,
  place           text not null check (place in ('office','home','elsewhere')),
  first_inside_at timestamptz not null,
  last_inside_at  timestamptz not null,
  last_outside_at timestamptz,
  primary key (member_id, local_date)
);
alter table public.presence_days enable row level security;
drop policy if exists presence_days_read on public.presence_days;
create policy presence_days_read on public.presence_days for select
  using (member_id = public.my_member_id() or (org_id = public.my_org_id() and public.is_org_admin()));
revoke all on public.presence_days from anon;
revoke insert, update, delete on public.presence_days from authenticated;
grant select on public.presence_days to authenticated;

-- ── holidays
create table if not exists public.public_holidays (
  day        date primary key,
  name       text not null check (char_length(name) between 2 and 80),
  confirmed  boolean not null default true,   -- false: expected date, waiting for the government's announcement
  updated_at timestamptz not null default now()
);
alter table public.public_holidays enable row level security;
drop policy if exists public_holidays_read on public.public_holidays;
create policy public_holidays_read on public.public_holidays for select using (true);
revoke all on public.public_holidays from anon;
revoke insert, update, delete on public.public_holidays from authenticated;
grant select on public.public_holidays to authenticated;

create table if not exists public.company_holidays (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations on delete cascade,
  day        date not null,
  name       text not null check (char_length(name) between 2 and 80),
  created_by uuid references public.members on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, day)
);
alter table public.company_holidays enable row level security;
drop policy if exists company_holidays_read on public.company_holidays;
create policy company_holidays_read on public.company_holidays for select using (org_id = public.my_org_id());
revoke all on public.company_holidays from anon;
revoke insert, update, delete on public.company_holidays from authenticated;
grant select on public.company_holidays to authenticated;

-- Nigerian public holidays. Islamic holidays follow the moon, so they are entered as expected dates
-- and confirmed (or moved) from Global Admin when the Federal Government announces them.
insert into public.public_holidays (day, name, confirmed) values
  ('2026-01-01', 'New Year’s Day', true),
  ('2026-03-20', 'Eid al-Fitr', false), ('2026-03-21', 'Eid al-Fitr (second day)', false),
  ('2026-04-03', 'Good Friday', true), ('2026-04-06', 'Easter Monday', true),
  ('2026-05-01', 'Workers’ Day', true),
  ('2026-05-27', 'Eid al-Adha', false), ('2026-05-28', 'Eid al-Adha (second day)', false),
  ('2026-06-12', 'Democracy Day', true),
  ('2026-08-26', 'Eid al-Mawlid', false),
  ('2026-10-01', 'Independence Day', true),
  ('2026-12-25', 'Christmas Day', true), ('2026-12-26', 'Boxing Day', true),
  ('2027-01-01', 'New Year’s Day', true),
  ('2027-03-10', 'Eid al-Fitr', false), ('2027-03-11', 'Eid al-Fitr (second day)', false),
  ('2027-03-26', 'Good Friday', true), ('2027-03-29', 'Easter Monday', true),
  ('2027-05-01', 'Workers’ Day', true),
  ('2027-05-17', 'Eid al-Adha', false), ('2027-05-18', 'Eid al-Adha (second day)', false),
  ('2027-06-12', 'Democracy Day', true),
  ('2027-08-15', 'Eid al-Mawlid', false),
  ('2027-10-01', 'Independence Day', true),
  ('2027-12-25', 'Christmas Day', true), ('2027-12-26', 'Boxing Day', true)
on conflict (day) do nothing;

-- The holiday on a company's date: its own holiday first, then a public one. Null = a normal day.
create or replace function public.holiday_name(p_org uuid, p_date date)
returns text language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select coalesce(
    (select c.name from public.company_holidays c where c.org_id = p_org and c.day = p_date
       and public.org_plan_now(p_org) in ('trial','pro','premium')),
    (select h.name from public.public_holidays h where h.day = p_date))
$$;
revoke all on function public.holiday_name(uuid, date) from public, anon;
grant execute on function public.holiday_name(uuid, date) to authenticated, service_role;

-- Holiday work: marked, and never "late".
create or replace function public.mark_holiday_attendance()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if public.holiday_name(new.org_id, new.local_date) is not null then
    new.flags := array_remove(coalesce(new.flags, '{}'::text[]), 'late');
    if not 'holiday' = any(new.flags) then new.flags := array_append(new.flags, 'holiday'); end if;
  end if;
  return new;
end $$;
drop trigger if exists attendance_zz_holiday on public.attendance;
create trigger attendance_zz_holiday before insert or update of at, flags on public.attendance
  for each row execute function public.mark_holiday_attendance();

-- Company admins manage their own holidays (Pro, Premium, trial).
create or replace function public.admin_add_holiday(p_day date, p_name text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_id uuid;
begin
  if auth.uid() is null or v_org is null or not public.is_org_admin() then raise exception 'Only this company''s admins can add holidays.'; end if;
  if public.org_plan_now(v_org) is distinct from 'trial' and public.org_plan_now(v_org) not in ('pro','premium') then
    raise exception 'Company holidays are part of the Pro and Premium plans.'; end if;
  if p_day is null or p_day < current_date - 31 or p_day > current_date + 730 then raise exception 'Choose a date within the next two years.'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 80 then raise exception 'Give the holiday a name (2 to 80 characters).'; end if;
  insert into public.company_holidays (org_id, day, name, created_by) values (v_org, p_day, trim(p_name), public.my_member_id())
  on conflict (org_id, day) do update set name = excluded.name
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.admin_add_holiday(date, text) from public, anon;
grant execute on function public.admin_add_holiday(date, text) to authenticated;

create or replace function public.admin_remove_holiday(p_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if auth.uid() is null or not public.is_org_admin() then raise exception 'Only this company''s admins can remove holidays.'; end if;
  delete from public.company_holidays where id = p_id and org_id = public.my_org_id();
end $$;
revoke all on function public.admin_remove_holiday(uuid) from public, anon;
grant execute on function public.admin_remove_holiday(uuid) to authenticated;

-- Global Admin keeps the public holiday list right (confirm or move Islamic dates, add declared days).
create or replace function public.console_set_public_holiday(p_day date, p_name text, p_confirmed boolean, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support'], p_reason, true);
  if p_day is null or char_length(trim(coalesce(p_name, ''))) not between 2 and 80 then raise exception 'Give a date and a name.'; end if;
  insert into public.public_holidays (day, name, confirmed, updated_at) values (p_day, trim(p_name), coalesce(p_confirmed, true), now())
  on conflict (day) do update set name = excluded.name, confirmed = excluded.confirmed, updated_at = now();
  perform public.console_log(null, 'holiday.set', p_reason, jsonb_build_object('day', p_day, 'name', trim(p_name), 'confirmed', p_confirmed));
end $$;
revoke all on function public.console_set_public_holiday(date, text, boolean, text) from public, anon;
grant execute on function public.console_set_public_holiday(date, text, boolean, text) to authenticated;

create or replace function public.console_remove_public_holiday(p_day date, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support'], p_reason, true);
  delete from public.public_holidays where day = p_day;
  perform public.console_log(null, 'holiday.remove', p_reason, jsonb_build_object('day', p_day));
end $$;
revoke all on function public.console_remove_public_holiday(date, text) from public, anon;
grant execute on function public.console_remove_public_holiday(date, text) to authenticated;

-- Admin switch for one person's automatic check-in.
create or replace function public.admin_set_auto_check_in(p_member uuid, p_on boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if auth.uid() is null or not public.is_org_admin() then raise exception 'Only this company''s admins can change this.'; end if;
  update public.members set auto_check_in_off = not coalesce(p_on, true)
   where id = p_member and org_id = public.my_org_id();
  if not found then raise exception 'That person isn''t in your company.'; end if;
end $$;
revoke all on function public.admin_set_auto_check_in(uuid, boolean) from public, anon;
grant execute on function public.admin_set_auto_check_in(uuid, boolean) to authenticated;

-- ── helpers
create or replace function public.scheduled_mode(p_member uuid, p_date date)
returns text language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select coalesce(
    (select s.mode from public.schedules s join public.members m on m.id = p_member
      where s.org_id = m.org_id and s.member_id = m.id and s.weekday = extract(isodow from p_date)),
    (select s.mode from public.schedules s join public.members m on m.id = p_member
      where s.org_id = m.org_id and s.member_id is null and s.weekday = extract(isodow from p_date)),
    'office')
$$;
revoke all on function public.scheduled_mode(uuid, date) from public, anon, authenticated;

-- Has this person earned automatic check-in? Their last 5 check-in days were all clean.
create or replace function public.auto_check_in_ready(p_member uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  with firsts as (
    select distinct on (a.local_date) a.local_date, a.location_type, a.flags
      from public.attendance a
     where a.member_id = p_member and a.kind = 'in'
       and a.local_date < (now() at time zone (select o.timezone from public.organizations o join public.members m on m.org_id = o.id where m.id = p_member))::date
     order by a.local_date desc, a.at asc),
  last5 as (select * from firsts order by local_date desc limit 5)
  select count(*) = 5 and bool_and(location_type <> 'none'
           and not (flags && array['out_of_range','wrong_location','low_accuracy','left_unapproved','off_day']))
    from last5
$$;
revoke all on function public.auto_check_in_ready(uuid) from public, anon, authenticated;

-- One person: check in automatically if every rule allows it. Returns the new event or null.
create or replace function public.try_auto_check_in(p_member uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare m public.members%rowtype; o public.organizations%rowtype; pd public.presence_days%rowtype;
        v_local timestamp; v_date date; v_mode text; v_last text; v_id uuid;
begin
  select * into m from public.members where id = p_member and status = 'active' and not auto_check_in_off;
  if not found then return null; end if;
  select * into o from public.organizations where id = m.org_id;
  if not o.auto_check_in or o.suspended_at is not null or o.work_end <= o.work_start then return null; end if;
  if public.org_plan_now(o.id) is distinct from 'trial' and public.org_plan_now(o.id) not in ('pro','premium') then return null; end if;
  v_local := now() at time zone o.timezone; v_date := v_local::date;
  if v_local::time < o.work_start or v_local::time >= o.work_end then return null; end if;
  if public.holiday_name(o.id, v_date) is not null then return null; end if;
  select * into pd from public.presence_days where member_id = m.id and local_date = v_date;
  if not found then return null; end if;
  v_mode := public.scheduled_mode(m.id, v_date);
  if v_mode = 'off' or (pd.place <> v_mode and pd.place <> 'elsewhere') then return null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(m.id::text, 0));
  select kind into v_last from public.attendance where member_id = m.id order by at desc limit 1;
  if v_last = 'in' then return null; end if;
  if exists (select 1 from public.attendance where member_id = m.id and local_date = v_date) then return null; end if;
  if not public.auto_check_in_ready(m.id) then return null; end if;
  insert into public.attendance (org_id, member_id, kind, at, local_date, location_type, expected_mode, flags)
  values (o.id, m.id, 'in', pd.first_inside_at, v_date, pd.place, v_mode, array['auto'])
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.try_auto_check_in(uuid) from public, anon, authenticated;

-- One open session: close it if closing-time rules say so. Returns the check-out time or null.
create or replace function public.try_auto_check_out(p_member uuid)
returns timestamptz language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare m public.members%rowtype; o public.organizations%rowtype; a public.attendance%rowtype; pd public.presence_days%rowtype;
        v_end timestamptz; v_cap timestamptz; v_out timestamptz; v_flags text[] := array['auto']; v_overtime boolean;
begin
  select * into m from public.members where id = p_member;
  select * into o from public.organizations where id = m.org_id;
  if not found or not o.auto_check_out or o.work_end <= o.work_start then return null; end if;
  select * into a from public.attendance where member_id = m.id order by at desc limit 1;
  if not found or a.kind <> 'in' then return null; end if;
  v_end := (a.local_date + o.work_end) at time zone o.timezone;
  if now() < v_end then return null; end if;
  v_overtime := o.overtime_allowed and coalesce(public.org_plan_now(o.id) in ('trial','pro','premium'), false);
  select * into pd from public.presence_days where member_id = m.id and local_date = a.local_date;

  if not v_overtime then
    v_out := v_end;
  else
    v_cap := (a.local_date + o.overtime_until) at time zone o.timezone;
    if v_cap <= v_end then v_cap := v_end + interval '4 hours'; end if;
    if now() >= v_cap then
      v_out := v_cap; v_flags := v_flags || array['overtime','overtime_cap'];
    elsif pd.last_inside_at is null or pd.last_inside_at < v_end then
      -- Not seen inside since closing: they had left. Give the app 30 minutes to report in first.
      if now() >= v_end + interval '30 minutes' or (pd.last_outside_at is not null and pd.last_outside_at >= v_end) then v_out := v_end; end if;
    elsif pd.last_outside_at is not null and pd.last_outside_at > pd.last_inside_at then
      v_out := pd.last_inside_at; v_flags := v_flags || array['overtime'];          -- left after closing
    elsif now() - pd.last_inside_at > interval '60 minutes' then
      v_out := pd.last_inside_at; v_flags := v_flags || array['overtime'];          -- no news for an hour
    end if;
  end if;
  if v_out is null then return null; end if;
  v_out := greatest(v_out, a.at);
  insert into public.attendance (org_id, member_id, kind, at, local_date, location_type, expected_mode, flags)
  values (o.id, m.id, 'out', v_out, a.local_date, a.location_type, a.expected_mode, v_flags);
  return v_out;
end $$;
revoke all on function public.try_auto_check_out(uuid) from public, anon, authenticated;

-- Every few minutes (pg_cron, and the app as a backup): apply the rules to everyone. Safe to run often.
create or replace function public.run_schedule_automation()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare r record; v_in integer := 0; v_out integer := 0;
begin
  for r in select pd.member_id from public.presence_days pd
            join public.organizations o on o.id = pd.org_id
           where pd.local_date = (now() at time zone o.timezone)::date and o.auto_check_in
  loop
    begin
      if public.try_auto_check_in(r.member_id) is not null then v_in := v_in + 1; end if;
    exception when others then null;   -- e.g. maintenance or a suspended company: try again next run
    end;
  end loop;
  for r in select distinct on (a.member_id) a.member_id, a.kind from public.attendance a
            join public.organizations o on o.id = a.org_id
           where o.auto_check_out and a.at > now() - interval '3 days'
           order by a.member_id, a.at desc
  loop
    if r.kind = 'in' then
      begin
        if public.try_auto_check_out(r.member_id) is not null then v_out := v_out + 1; end if;
      exception when others then null;
      end;
    end if;
  end loop;
  delete from public.presence_days where local_date < current_date - 90;
  return jsonb_build_object('checked_in', v_in, 'checked_out', v_out);
end $$;
revoke all on function public.run_schedule_automation() from public, anon, authenticated;
grant execute on function public.run_schedule_automation() to service_role;

-- ── the app's location check-in (every few minutes while 5ime is open), now also for automation
create or replace function public.report_presence(p_lat float8, p_lng float8, p_accuracy float8)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare m public.members%rowtype; o public.organizations%rowtype; v_open public.attendance%rowtype; v_place text;
        v_departure public.presence_departures%rowtype;
        v_req public.work_location_requests%rowtype; v_date date; v_closing boolean := false; v_auto uuid; v_out timestamptz;
begin
  perform public.rate_limit_hit('presence', 'u:' || auth.uid(), 30, interval '1 hour');
  select * into m from public.members where user_id = auth.uid() and status = 'active';
  if not found then return jsonb_build_object('status', 'inactive'); end if;
  if p_lat is null or p_lat not between -90 and 90 or p_lng is null or p_lng not between -180 and 180 then
    raise exception 'Location coordinates are invalid.'; end if;
  select * into o from public.organizations where id = m.org_id;
  v_date := (now() at time zone o.timezone)::date;
  select * into v_open from public.attendance where member_id = m.id order by at desc limit 1;
  select * into v_req from public.work_location_requests where member_id = m.id and status in ('pending','approved')
   order by requested_at desc limit 1;
  if coalesce(p_accuracy, 9999) > 150 then
    return jsonb_build_object('status', 'weak_signal', 'request_status', v_req.status);
  end if;

  -- Note the sighting (times and kind of place only).
  v_place := public.inside_approved_place(m.id, p_lat, p_lng, p_accuracy);
  if v_place is not null then
    insert into public.presence_days (member_id, org_id, local_date, place, first_inside_at, last_inside_at)
    values (m.id, m.org_id, v_date, v_place, now(), now())
    on conflict (member_id, local_date) do update set last_inside_at = now();
  else
    update public.presence_days set last_outside_at = now() where member_id = m.id and local_date = v_date;
  end if;

  if v_open.id is null or v_open.kind <> 'in' then
    v_auto := public.try_auto_check_in(m.id);
    return jsonb_build_object('status', case when v_auto is not null then 'auto_checked_in' else 'not_checked_in' end);
  end if;

  -- Closing time: close the day if the rules say so; otherwise say it's closing time.
  if o.auto_check_out and o.work_end > o.work_start and now() >= (v_open.local_date + o.work_end) at time zone o.timezone then
    v_out := public.try_auto_check_out(m.id);
    if v_out is not null then return jsonb_build_object('status', 'auto_checked_out', 'at', v_out); end if;
    v_closing := true;
  end if;

  select * into v_departure from public.presence_departures where session_in_id = v_open.id;
  if v_place is not null then
    if found and v_departure.resolution is null then
      update public.presence_departures set returned_at = now(), resolution = 'returned', resolved_at = now() where id = v_departure.id;
    end if;
    return jsonb_build_object('status', 'inside', 'place', v_place, 'request_status', v_req.status, 'closing', v_closing);
  end if;
  if v_closing then return jsonb_build_object('status', 'outside', 'closing', true); end if;
  if not found then
    insert into public.presence_departures(org_id, member_id, session_in_id, lat, lng, accuracy_m)
      values (m.org_id, m.id, v_open.id, p_lat, p_lng, p_accuracy)
      returning * into v_departure;
  end if;
  return jsonb_build_object('status', 'outside', 'departed_at', v_departure.departed_at,
                            'request_status', v_req.status, 'departure_resolution', v_departure.resolution);
end $$;
revoke all on function public.report_presence(float8, float8, float8) from public, anon;
grant execute on function public.report_presence(float8, float8, float8) to authenticated;

-- Run every 5 minutes inside the database when pg_cron is available (Supabase: Database → Extensions).
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron is not available here; the app runs the schedule automation instead.';
    return;
  end;
  begin
    perform cron.unschedule('5ime-schedule-automation');
  exception when others then null;
  end;
  perform cron.schedule('5ime-schedule-automation', '*/5 * * * *', 'select public.run_schedule_automation()');
exception when others then
  raise notice 'Could not schedule the automation with pg_cron: %', sqlerrm;
end $$;

-- The plan lists mention the new features (only when they still read as 0018 set them).
update public.platform_plans set features = array['Up to 15 staff','1 office + approved home locations','GPS check-in and check-out (200 m area)',
    'One weekly office/home schedule for everyone','Late arrival and early exit tracking','Automatic check-out at closing time',
    'Nigerian public holidays built in','Your logo in the app','30 days of history, CSV export','Email support'], updated_at = now()
 where plan = 'basic' and features[7] = 'Nigerian public holidays built in';
update public.platform_plans set features = array['Everything in Basic, with unlimited staff','Unlimited offices and branches, check-in area per office',
    'Schedules per person or team','Managers and teams','Automatic check-in on arrival, overtime and company holidays',
    'Your full brand: colours, sign-in page, app icon and emails','Visitor management at one office (up to 100 visits a month)',
    'Weak-GPS flags, device and IP records','Unlimited history and full reports','WhatsApp and email support'], updated_at = now()
 where plan = 'pro' and features[1] = 'Everything in Basic, with unlimited staff' and cardinality(features) = 9;
