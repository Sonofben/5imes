-- 0022 · Celebrations: birthdays and work anniversaries
--  * In the app (every plan): the person celebrating sees a celebration screen; colleagues see a
--    pop-up and can send wishes.
--  * By email (Pro, Premium, trial): one announcement a day to the company's group email, and a
--    heads-up a few days before to HR (or the admins) so they can plan.
--  * Birthdays come from member_private_details (day and month only); people can opt out of
--    birthday announcements. Anniversaries come from members.start_date.
--  * Celebrations on Saturday or Sunday move to Friday (default) or Monday, or stay on the day.
--  * 29 February birthdays are celebrated on 28 February in other years.

alter table public.organizations add column if not exists celebrations_on boolean not null default true;
alter table public.organizations add column if not exists celebrations_email text
  check (celebrations_email is null or celebrations_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table public.organizations add column if not exists celebrations_hr_email text
  check (celebrations_hr_email is null or celebrations_hr_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table public.organizations add column if not exists celebrations_heads_up_days smallint not null default 3
  check (celebrations_heads_up_days between 0 and 14);
alter table public.organizations add column if not exists celebrations_weekend text not null default 'friday'
  check (celebrations_weekend in ('friday','monday','same'));

create or replace function public.admin_celebration_settings(p_on boolean, p_email text, p_hr_email text, p_heads_up integer, p_weekend text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if auth.uid() is null or not public.is_org_admin() then raise exception 'Only this company''s admins can change celebrations.'; end if;
  if p_weekend not in ('friday','monday','same') or coalesce(p_heads_up, 3) not between 0 and 14 then raise exception 'Check the settings.'; end if;
  update public.organizations set celebrations_on = coalesce(p_on, true), celebrations_email = nullif(lower(trim(p_email)), ''),
         celebrations_hr_email = nullif(lower(trim(p_hr_email)), ''), celebrations_heads_up_days = coalesce(p_heads_up, 3),
         celebrations_weekend = p_weekend
   where id = public.my_org_id();
exception when check_violation then
  raise exception 'Enter a valid email address.';
end $$;
revoke all on function public.admin_celebration_settings(boolean, text, text, integer, text) from public, anon;
grant execute on function public.admin_celebration_settings(boolean, text, text, integer, text) to authenticated;

-- Profile picture (a link in our public avatars storage, set by the server after an upload).
create or replace function public.set_member_avatar(p_member uuid, p_url text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  update public.members set avatar_url = p_url where id = p_member;
end $$;
revoke all on function public.set_member_avatar(uuid, text) from public, anon, authenticated;
grant execute on function public.set_member_avatar(uuid, text) to service_role;

-- Is someone celebrated on this company date, counting the weekend rule?
-- Returns the dates whose celebrations are shown on p_date.
create or replace function public.celebration_dates(p_org uuid, p_date date)
returns date[] language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select case
    when o.celebrations_weekend = 'friday' and extract(isodow from p_date) = 5 then array[p_date, p_date + 1, p_date + 2]
    when o.celebrations_weekend = 'friday' and extract(isodow from p_date) in (6,7) then array[]::date[]
    when o.celebrations_weekend = 'monday' and extract(isodow from p_date) = 1 then array[p_date - 2, p_date - 1, p_date]
    when o.celebrations_weekend = 'monday' and extract(isodow from p_date) in (6,7) then array[]::date[]
    else array[p_date] end
  from public.organizations o where o.id = p_org
$$;
revoke all on function public.celebration_dates(uuid, date) from public, anon, authenticated;

create or replace function public.birthday_on(p_month integer, p_day integer, p_date date)
returns boolean language sql immutable set search_path = pg_catalog, public, pg_temp as $$
  select p_month = extract(month from p_date) and (p_day = extract(day from p_date)
    or (p_month = 2 and p_day = 29 and extract(day from p_date) = 28
        and extract(day from (make_date(extract(year from p_date)::int, 3, 1) - 1)) = 28))
$$;

-- Everyone celebrated in a company on a date: [{member_id, name, first_name, avatar_url, birthday, years}].
create or replace function public.celebrations_for(p_org uuid, p_date date)
returns jsonb language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  with days as (select unnest(public.celebration_dates(p_org, p_date)) as d),
  people as (
    select m.id, coalesce(nullif(trim(m.full_name), ''), split_part(m.email, '@', 1)) as name, m.avatar_url,
           bool_or(pd.birth_month is not null and not pd.celebrate_opt_out and public.birthday_on(pd.birth_month, pd.birth_day, days.d)) as birthday,
           max(case when m.start_date is not null and m.start_date < days.d
                     and extract(month from m.start_date) = extract(month from days.d)
                     and extract(day from m.start_date) = extract(day from days.d)
                    then extract(year from age(days.d, m.start_date))::int end) as years
      from public.members m
      cross join days
      left join public.member_private_details pd on pd.member_id = m.id
     where m.org_id = p_org and m.status = 'active'
     group by m.id, m.full_name, m.email, m.avatar_url)
  select coalesce(jsonb_agg(jsonb_build_object('member_id', id, 'name', name, 'first_name', split_part(name, ' ', 1),
           'avatar_url', avatar_url, 'birthday', birthday, 'years', years) order by name), '[]'::jsonb)
    from people where birthday or years >= 1
$$;
revoke all on function public.celebrations_for(uuid, date) from public, anon, authenticated;

-- Staff: who is celebrated today in my company (no birth dates are revealed, only "birthday today").
create or replace function public.my_celebrations_today()
returns jsonb language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select case when o.celebrations_on then public.celebrations_for(o.id, (now() at time zone o.timezone)::date) else '[]'::jsonb end
    from public.organizations o where o.id = public.my_org_id()
$$;
revoke all on function public.my_celebrations_today() from public, anon;
grant execute on function public.my_celebrations_today() to authenticated;

-- Wishes from colleagues.
create table if not exists public.celebration_wishes (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations on delete cascade,
  celebrant_id uuid not null references public.members on delete cascade,
  from_id      uuid not null references public.members on delete cascade,
  day          date not null,
  message      text not null check (char_length(trim(message)) between 1 and 280),
  created_at   timestamptz not null default now(),
  unique (celebrant_id, from_id, day)
);
alter table public.celebration_wishes enable row level security;
drop policy if exists celebration_wishes_read on public.celebration_wishes;
create policy celebration_wishes_read on public.celebration_wishes for select
  using (org_id = public.my_org_id() and (celebrant_id = public.my_member_id() or from_id = public.my_member_id()));
revoke all on public.celebration_wishes from anon;
revoke insert, update, delete on public.celebration_wishes from authenticated;
grant select on public.celebration_wishes to authenticated;

create or replace function public.send_wish(p_celebrant uuid, p_message text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_me uuid := public.my_member_id(); v_org uuid := public.my_org_id(); v_day date;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  if v_me = p_celebrant then raise exception 'You can''t send wishes to yourself.'; end if;
  perform public.rate_limit_hit('wish', 'm:' || v_me, 40, interval '1 hour');
  if not exists (select 1 from jsonb_array_elements(public.my_celebrations_today()) c where (c ->> 'member_id')::uuid = p_celebrant) then
    raise exception 'They aren''t being celebrated today.'; end if;
  v_day := (now() at time zone (select timezone from public.organizations where id = v_org))::date;
  insert into public.celebration_wishes (org_id, celebrant_id, from_id, day, message)
  values (v_org, p_celebrant, v_me, v_day, left(trim(p_message), 280))
  on conflict (celebrant_id, from_id, day) do update set message = excluded.message, created_at = now();
end $$;
revoke all on function public.send_wish(uuid, text) from public, anon;
grant execute on function public.send_wish(uuid, text) to authenticated;

-- Emails: which companies are due an announcement or a heads-up now. Each is claimed once a day.
create table if not exists public.celebration_sends (
  org_id  uuid not null references public.organizations on delete cascade,
  day     date not null,
  kind    text not null check (kind in ('announce','heads_up')),
  sent_at timestamptz not null default now(),
  primary key (org_id, day, kind)
);
alter table public.celebration_sends enable row level security;
revoke all on public.celebration_sends from anon, authenticated;

-- From 08:00 company time. Returns [{org_id, name, logo_url, accent, kind, to, day, people}] and marks them claimed.
create or replace function public.claim_celebration_emails()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare o record; v_local timestamp; v_day date; v_people jsonb; v_out jsonb := '[]'::jsonb; v_to text; v_ahead date;
begin
  for o in select g.* from public.organizations g
            where g.celebrations_on and g.suspended_at is null and public.org_has_pro(g.id)
  loop
    v_local := now() at time zone o.timezone; v_day := v_local::date;
    if v_local::time < time '08:00' then continue; end if;
    -- today's announcement to the group email
    if o.celebrations_email is not null and not exists (select 1 from public.celebration_sends where org_id = o.id and day = v_day and kind = 'announce') then
      v_people := public.celebrations_for(o.id, v_day);
      insert into public.celebration_sends (org_id, day, kind) values (o.id, v_day, 'announce');
      if jsonb_array_length(v_people) > 0 then
        v_out := v_out || jsonb_build_object('org_id', o.id, 'name', o.name, 'logo_url', o.logo_url, 'accent', o.accent_color,
          'kind', 'announce', 'to', o.celebrations_email, 'day', v_day, 'people', v_people);
      end if;
    end if;
    -- heads-up for HR, N days ahead
    if o.celebrations_heads_up_days > 0 and not exists (select 1 from public.celebration_sends where org_id = o.id and day = v_day and kind = 'heads_up') then
      v_ahead := v_day + o.celebrations_heads_up_days;
      v_people := public.celebrations_for(o.id, v_ahead);
      insert into public.celebration_sends (org_id, day, kind) values (o.id, v_day, 'heads_up');
      v_to := coalesce(o.celebrations_hr_email,
        (select string_agg(m.email, ',') from public.members m where m.org_id = o.id and m.status = 'active' and m.role in ('owner','admin')));
      if jsonb_array_length(v_people) > 0 and v_to is not null then
        v_out := v_out || jsonb_build_object('org_id', o.id, 'name', o.name, 'logo_url', o.logo_url, 'accent', o.accent_color,
          'kind', 'heads_up', 'to', v_to, 'day', v_ahead, 'people', v_people);
      end if;
    end if;
  end loop;
  delete from public.celebration_sends where day < current_date - 30;
  return v_out;
end $$;
revoke all on function public.claim_celebration_emails() from public, anon, authenticated;
grant execute on function public.claim_celebration_emails() to service_role;

update public.platform_plans set features = array_append(features, 'Birthday and work anniversary celebrations by email'), updated_at = now()
 where plan = 'pro' and not features @> array['Birthday and work anniversary celebrations by email'];
update public.platform_plans set features = array_append(features, 'Birthday and work anniversary celebrations in the app'), updated_at = now()
 where plan = 'basic' and not features @> array['Birthday and work anniversary celebrations in the app'];
