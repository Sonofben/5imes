-- 0024 · Field staff: client sites and visits
--
--  * Admins mark some people as field staff and keep a list of client sites (name, address, pin).
--  * Field staff check in at a site when they arrive (GPS must be within the site's area), add a note,
--    an outcome and an optional photo, and check out. Each visit is timed.
--  * Managers plan visits for their team ("Shoprite Lekki on Tuesday") and see planned against done.
--  * Privacy: location is read only at visit check-in and check-out, and only the distance from the
--    site and the GPS accuracy are kept, never coordinates. Nobody is tracked between visits.
--  * Plan: Premium (and trials), or Pro with the field staff add-on (a number of field people that
--    Global Admin sets after payment).

alter table public.members add column if not exists is_field boolean not null default false;
alter table public.organizations add column if not exists field_addon_seats integer not null default 0
  check (field_addon_seats between 0 and 100000);

create or replace function public.org_has_field(p_org uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select coalesce(public.org_plan_now(p_org) in ('trial','premium')
      or (public.org_plan_now(p_org) = 'pro' and (select field_addon_seats from public.organizations where id = p_org) > 0), false)
$$;
revoke all on function public.org_has_field(uuid) from public, anon;
grant execute on function public.org_has_field(uuid) to authenticated, service_role;

create table if not exists public.client_sites (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations on delete cascade,
  name          text not null check (char_length(trim(name)) between 2 and 120),
  address       text check (address is null or char_length(address) <= 300),
  lat           double precision not null check (lat between -90 and 90),
  lng           double precision not null check (lng between -180 and 180),
  radius_m      integer not null default 150 check (radius_m between 30 and 2000),
  contact_name  text check (contact_name is null or char_length(contact_name) <= 120),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 40),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists client_sites_org_idx on public.client_sites (org_id, active);

create table if not exists public.site_visits (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations on delete cascade,
  member_id     uuid not null references public.members on delete cascade,
  site_id       uuid not null references public.client_sites on delete restrict,
  planned_date  date,
  planned_by    uuid references public.members on delete set null,
  plan_note     text check (plan_note is null or char_length(plan_note) <= 300),
  status        text not null default 'planned' check (status in ('planned','in_progress','done','cancelled')),
  started_at    timestamptz,
  start_distance_m numeric(8,1),
  start_accuracy_m numeric(8,1),
  ended_at      timestamptz,
  end_distance_m numeric(8,1),
  end_accuracy_m numeric(8,1),
  note          text check (note is null or char_length(note) <= 2000),
  outcome       text check (outcome is null or outcome in ('completed','follow_up','no_one_available','order_taken','issue_reported','other')),
  photo_path    text check (photo_path is null or char_length(photo_path) <= 300),
  flags         text[] not null default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists site_visits_member_idx on public.site_visits (member_id, planned_date);
create index if not exists site_visits_org_idx on public.site_visits (org_id, started_at desc);
create unique index if not exists site_visits_one_open on public.site_visits (member_id) where status = 'in_progress';

alter table public.client_sites enable row level security;
alter table public.site_visits enable row level security;
drop policy if exists client_sites_read on public.client_sites;
create policy client_sites_read on public.client_sites for select using (org_id = public.my_org_id());
drop policy if exists site_visits_read on public.site_visits;
create policy site_visits_read on public.site_visits for select using (
  member_id = public.my_member_id()
  or (org_id = public.my_org_id() and (public.is_org_admin()
      or exists (select 1 from public.members m where m.id = site_visits.member_id and m.line_manager_id = public.my_member_id()))));
revoke all on public.client_sites from anon;
revoke all on public.site_visits from anon;
revoke insert, update, delete on public.client_sites from authenticated;
revoke insert, update, delete on public.site_visits from authenticated;
grant select on public.client_sites to authenticated;
grant select on public.site_visits to authenticated;

-- ── admin: field staff and sites
create or replace function public.admin_set_field(p_member uuid, p_on boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_used integer; v_max integer;
begin
  if auth.uid() is null or not public.is_org_admin() then raise exception 'Only this company''s admins can choose field staff.'; end if;
  if p_on then
    if not public.org_has_field(v_org) then raise exception 'Field staff is part of Premium, or an add-on for Pro.'; end if;
    if public.org_plan_now(v_org) = 'pro' then
      select field_addon_seats into v_max from public.organizations where id = v_org;
      select count(*) into v_used from public.members where org_id = v_org and is_field and status = 'active' and id <> p_member;
      if v_used >= v_max then raise exception 'Your field staff add-on covers % people. Add more places to mark someone else.', v_max; end if;
    end if;
  end if;
  update public.members set is_field = coalesce(p_on, false) where id = p_member and org_id = v_org;
  if not found then raise exception 'That person isn''t in your company.'; end if;
end $$;
revoke all on function public.admin_set_field(uuid, boolean) from public, anon;
grant execute on function public.admin_set_field(uuid, boolean) to authenticated;

-- Rows: [{id?, name, address, lat, lng, radius_m, contact_name, contact_phone, active}]. With id: update.
create or replace function public.admin_save_sites(p_rows jsonb)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare r jsonb; v_org uuid := public.my_org_id(); v_n integer := 0;
begin
  if auth.uid() is null or not public.is_org_viewer() then raise exception 'Only managers and admins can manage client sites.'; end if;
  if not public.org_has_field(v_org) then raise exception 'Field staff is part of Premium, or an add-on for Pro.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then raise exception 'Send up to 2,000 sites at a time.'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if (r ->> 'lat') is null or (r ->> 'lng') is null then raise exception 'Every site needs a map pin (latitude and longitude): %', r ->> 'name'; end if;
    if nullif(r ->> 'id', '') is null then
      insert into public.client_sites (org_id, name, address, lat, lng, radius_m, contact_name, contact_phone)
      values (v_org, trim(r ->> 'name'), nullif(trim(coalesce(r ->> 'address', '')), ''), (r ->> 'lat')::float8, (r ->> 'lng')::float8,
              coalesce((r ->> 'radius_m')::integer, 150), nullif(trim(coalesce(r ->> 'contact_name', '')), ''), nullif(trim(coalesce(r ->> 'contact_phone', '')), ''));
    else
      update public.client_sites set name = trim(r ->> 'name'), address = nullif(trim(coalesce(r ->> 'address', '')), ''),
             lat = (r ->> 'lat')::float8, lng = (r ->> 'lng')::float8, radius_m = coalesce((r ->> 'radius_m')::integer, 150),
             contact_name = nullif(trim(coalesce(r ->> 'contact_name', '')), ''), contact_phone = nullif(trim(coalesce(r ->> 'contact_phone', '')), ''),
             active = coalesce((r ->> 'active')::boolean, true)
       where id = (r ->> 'id')::uuid and org_id = v_org;
      if not found then raise exception 'That site isn''t in your company.'; end if;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
exception when check_violation then
  raise exception 'A site has a missing name or a value out of range (area 30 to 2000 metres).';
end $$;
revoke all on function public.admin_save_sites(jsonb) from public, anon;
grant execute on function public.admin_save_sites(jsonb) to authenticated;

-- ── planning (managers for their team, admins for anyone)
create or replace function public.plan_visit(p_member uuid, p_site uuid, p_date date, p_note text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_id uuid;
begin
  if not public.org_has_field(v_org) then raise exception 'Field staff is part of Premium, or an add-on for Pro.'; end if;
  if not (public.is_org_admin() or exists (select 1 from public.members m where m.id = p_member and m.org_id = v_org and m.line_manager_id = public.my_member_id())) then
    raise exception 'You can plan visits for your own team only.'; end if;
  if not exists (select 1 from public.members where id = p_member and org_id = v_org and is_field and status = 'active') then raise exception 'Mark this person as field staff first.'; end if;
  if not exists (select 1 from public.client_sites where id = p_site and org_id = v_org and active) then raise exception 'Choose a client site.'; end if;
  if p_date is null or p_date < current_date - 1 or p_date > current_date + 366 then raise exception 'Choose a date in the coming year.'; end if;
  insert into public.site_visits (org_id, member_id, site_id, planned_date, planned_by, plan_note)
  values (v_org, p_member, p_site, p_date, public.my_member_id(), nullif(left(trim(coalesce(p_note, '')), 300), '')) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.plan_visit(uuid, uuid, date, text) from public, anon;
grant execute on function public.plan_visit(uuid, uuid, date, text) to authenticated;

create or replace function public.cancel_visit(p_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v public.site_visits%rowtype;
begin
  select * into v from public.site_visits where id = p_id and org_id = public.my_org_id();
  if not found or v.status <> 'planned' then raise exception 'Only planned visits can be cancelled.'; end if;
  if not (public.is_org_admin() or coalesce(v.planned_by = public.my_member_id(), false)
          or exists (select 1 from public.members m where m.id = v.member_id and m.line_manager_id = public.my_member_id())) then
    raise exception 'Only the person who planned it, their manager or an admin can cancel it.'; end if;
  update public.site_visits set status = 'cancelled' where id = p_id;
end $$;
revoke all on function public.cancel_visit(uuid) from public, anon;
grant execute on function public.cancel_visit(uuid) to authenticated;

-- ── field staff: start and end a visit
create or replace function public.start_visit(p_site uuid, p_lat float8, p_lng float8, p_accuracy float8)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare m public.members%rowtype; s public.client_sites%rowtype; v_dist float8; v_id uuid; v_today date;
begin
  select * into m from public.members where user_id = auth.uid() and status = 'active';
  if not found or not m.is_field then raise exception 'Only field staff can check in at client sites.'; end if;
  if not public.org_has_field(m.org_id) then raise exception 'Field staff is part of Premium, or an add-on for Pro.'; end if;
  perform public.rate_limit_hit('visit_start', 'm:' || m.id, 60, interval '1 hour');
  select * into s from public.client_sites where id = p_site and org_id = m.org_id and active;
  if not found then raise exception 'Choose a client site.'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Location is missing.'; end if;
  if p_accuracy is null or p_accuracy > 150 then
    raise exception 'GPS is too rough (±% m). Step outside or wait a moment, then try again.', round(coalesce(p_accuracy, 9999)); end if;
  v_dist := public.distance_m(p_lat, p_lng, s.lat, s.lng);
  if v_dist > s.radius_m + least(p_accuracy, 50) then
    raise exception 'You are about % m from %. Check in when you get there.', round(v_dist), s.name; end if;
  if exists (select 1 from public.site_visits where member_id = m.id and status = 'in_progress') then
    raise exception 'Finish your current visit first.'; end if;
  v_today := (now() at time zone (select timezone from public.organizations where id = m.org_id))::date;
  select id into v_id from public.site_visits where member_id = m.id and site_id = s.id and status = 'planned' and planned_date = v_today order by created_at limit 1;
  if v_id is not null then
    update public.site_visits set status = 'in_progress', started_at = now(), start_distance_m = round(v_dist::numeric, 1), start_accuracy_m = round(p_accuracy::numeric, 1)
     where id = v_id;
  else
    insert into public.site_visits (org_id, member_id, site_id, status, started_at, start_distance_m, start_accuracy_m)
    values (m.org_id, m.id, s.id, 'in_progress', now(), round(v_dist::numeric, 1), round(p_accuracy::numeric, 1)) returning id into v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.start_visit(uuid, float8, float8, float8) from public, anon;
grant execute on function public.start_visit(uuid, float8, float8, float8) to authenticated;

create or replace function public.end_visit(p_id uuid, p_lat float8, p_lng float8, p_accuracy float8, p_note text, p_outcome text, p_photo text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v public.site_visits%rowtype; s public.client_sites%rowtype; v_dist float8; v_flags text[] := '{}';
begin
  select * into v from public.site_visits where id = p_id and member_id = public.my_member_id() for update;
  if not found or v.status <> 'in_progress' then raise exception 'That visit isn''t open.'; end if;
  if p_outcome is not null and p_outcome not in ('completed','follow_up','no_one_available','order_taken','issue_reported','other') then raise exception 'Choose an outcome.'; end if;
  if p_photo is not null and position((v.org_id::text || '/' || v.member_id::text || '/') in p_photo) <> 1 then raise exception 'That photo isn''t yours.'; end if;
  select * into s from public.client_sites where id = v.site_id;
  if p_lat is not null and p_lng is not null then
    v_dist := public.distance_m(p_lat, p_lng, s.lat, s.lng);
    if v_dist > s.radius_m + least(coalesce(p_accuracy, 0), 50) then v_flags := array_append(v_flags, 'ended_away'); end if;
  else
    v_flags := array_append(v_flags, 'no_location_at_end');
  end if;
  if now() - v.started_at < interval '2 minutes' then v_flags := array_append(v_flags, 'very_short'); end if;
  update public.site_visits set status = 'done', ended_at = now(), end_distance_m = round(v_dist::numeric, 1),
         end_accuracy_m = round(p_accuracy::numeric, 1), note = nullif(left(trim(coalesce(p_note, '')), 2000), ''),
         outcome = p_outcome, photo_path = p_photo, flags = v_flags
   where id = p_id;
end $$;
revoke all on function public.end_visit(uuid, float8, float8, float8, text, text, text) from public, anon;
grant execute on function public.end_visit(uuid, float8, float8, float8, text, text, text) to authenticated;

-- Close visits left open for 12 hours (forgot to check out); flagged.
create or replace function public.close_forgotten_visits()
returns integer language sql security definer set search_path = pg_catalog, public, pg_temp as $$
  with c as (update public.site_visits set status = 'done', ended_at = started_at + interval '12 hours', flags = array_append(flags, 'not_checked_out')
              where status = 'in_progress' and started_at < now() - interval '12 hours' returning 1)
  select count(*)::integer from c
$$;
revoke all on function public.close_forgotten_visits() from public, anon, authenticated;
grant execute on function public.close_forgotten_visits() to service_role;

-- Per person over a period: planned, done, missed, time on site. Managers: their team; admins: everyone.
create or replace function public.field_report(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_today date;
begin
  if not public.is_org_viewer() then raise exception 'Only managers and admins can see field reports.'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'Choose a period of up to one year.'; end if;
  v_today := (now() at time zone (select timezone from public.organizations where id = v_org))::date;
  return coalesce((select jsonb_agg(r order by r ->> 'name') from (
    select jsonb_build_object('member_id', m.id, 'name', coalesce(m.full_name, m.email), 'team', m.team,
      'planned', count(v.id) filter (where v.planned_date between p_from and p_to),
      'done', count(v.id) filter (where v.status = 'done' and v.started_at is not null
                                   and (v.started_at at time zone o.timezone)::date between p_from and p_to),
      'missed', count(v.id) filter (where v.status = 'planned' and v.planned_date between p_from and least(p_to, v_today - 1)),
      'unplanned', count(v.id) filter (where v.planned_date is null and v.status = 'done' and (v.started_at at time zone o.timezone)::date between p_from and p_to),
      'minutes_on_site', coalesce(round(sum(extract(epoch from v.ended_at - v.started_at) / 60) filter (where v.status = 'done'
                                   and (v.started_at at time zone o.timezone)::date between p_from and p_to)), 0),
      'flagged', count(v.id) filter (where cardinality(v.flags) > 0 and (v.started_at at time zone o.timezone)::date between p_from and p_to)) as r
      from public.members m join public.organizations o on o.id = m.org_id
      left join public.site_visits v on v.member_id = m.id
     where m.org_id = v_org and m.status = 'active' and m.is_field
       and (public.is_org_admin() or m.line_manager_id = public.my_member_id())
     group by m.id, m.full_name, m.email, m.team) x), '[]'::jsonb);
end $$;
revoke all on function public.field_report(date, date) from public, anon;
grant execute on function public.field_report(date, date) to authenticated;

-- Global Admin sets the Pro add-on places after payment.
create or replace function public.console_set_field_addon(p_org uuid, p_seats integer, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','finance','support'], p_reason, true);
  if p_seats is null or p_seats < 0 or p_seats > 100000 then raise exception 'Enter 0 or more places.'; end if;
  update public.organizations set field_addon_seats = p_seats where id = p_org;
  if not found then raise exception 'Company not found.'; end if;
  perform public.console_log(p_org, 'billing.field_addon', p_reason, jsonb_build_object('seats', p_seats));
end $$;
revoke all on function public.console_set_field_addon(uuid, integer, text) from public, anon;
grant execute on function public.console_set_field_addon(uuid, integer, text) to authenticated;

update public.platform_plans set features = array_append(features, 'Field staff: client sites, visit check-in with notes and photos, planned visits'), updated_at = now()
 where plan = 'premium' and not features @> array['Field staff: client sites, visit check-in with notes and photos, planned visits'];
update public.platform_plans set features = array_append(features, 'Field staff available as an add-on'), updated_at = now()
 where plan = 'pro' and not features @> array['Field staff available as an add-on'];
