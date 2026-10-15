-- 5ime: line managers, "work from somewhere else" requests, leaving-location
-- detection, and addresses for maps.
--
-- Rules agreed with the product owner:
--   * A person asks their LINE MANAGER (admins can also decide) to work from a
--     place that is not their approved office/home.
--   * While the request is waiting, the workday runs normally.
--   * Approved  → the session simply continues; that place counts as approved
--                 for that company day (no restart, no break).
--   * Rejected  → the person is checked out at the moment they asked to move
--                 (or the moment the app first saw them outside, if earlier).
--                 The day is flagged "left_unapproved".
--   * While a person is checked in and 5ime is open, the app re-checks GPS every
--     15 minutes. Leaving the approved place is recorded once per session.
--     If they never ask, their line manager/admin can end the session at the
--     time they left.
--
-- Apply after 0010. Safe to re-run.
begin;

-- ───────────────────────────────────────────── addresses (for maps)
alter table public.locations add column if not exists address text check (char_length(address) <= 300);
alter table public.member_private_locations add column if not exists home_address text check (char_length(home_address) <= 300);
alter table public.member_private_locations add column if not exists home_req_address text check (char_length(home_req_address) <= 300);

-- ───────────────────────────────────────────── line managers
alter table public.members add column if not exists line_manager_id uuid references public.members(id) on delete set null;
create index if not exists members_line_manager_idx on public.members(line_manager_id);

create or replace function public.my_member_id()
returns uuid language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select id from public.members where user_id = auth.uid() and status = 'active' limit 1;
$$;
revoke all on function public.my_member_id() from public, anon;
grant execute on function public.my_member_id() to authenticated;

create or replace function public.set_line_manager(p_member uuid, p_manager uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id();
begin
  if not public.is_org_admin() then raise exception 'Only admins can set line managers.'; end if;
  if not exists (select 1 from public.members where id = p_member and org_id = v_org) then
    raise exception 'That person is not in your company.';
  end if;
  if p_manager is not null then
    if p_manager = p_member then raise exception 'A person cannot be their own line manager.'; end if;
    if not exists (select 1 from public.members where id = p_manager and org_id = v_org and status = 'active'
                   and role in ('owner','admin','manager')) then
      raise exception 'The line manager must be an active manager or admin in your company.';
    end if;
  end if;
  update public.members set line_manager_id = p_manager where id = p_member and org_id = v_org;
end $$;
revoke all on function public.set_line_manager(uuid, uuid) from public, anon;
grant execute on function public.set_line_manager(uuid, uuid) to authenticated;

-- Staff can't read other people's rows, so expose just their line manager's name.
create or replace function public.my_line_manager()
returns table (id uuid, full_name text, email text)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select lm.id, lm.full_name, lm.email
    from public.members me join public.members lm on lm.id = me.line_manager_id
   where me.user_id = auth.uid() and me.status = 'active';
$$;
revoke all on function public.my_line_manager() from public, anon;
grant execute on function public.my_line_manager() to authenticated;

-- ───────────────────────────────────────────── attendance: a new place type
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.attendance'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%location_type%'
  loop
    execute format('alter table public.attendance drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.attendance add constraint attendance_location_type_check
  check (location_type in ('office','home','elsewhere','none'));

-- ───────────────────────────────────────────── leaving the approved place
create table if not exists public.presence_departures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  member_id uuid not null references public.members on delete cascade,
  session_in_id uuid not null references public.attendance(id) on delete cascade,
  departed_at timestamptz not null default now(),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m double precision,
  returned_at timestamptz,
  resolution text check (resolution in ('returned','requested','approved','rejected','ended_by_manager')),
  resolved_at timestamptz,
  resolved_by uuid references public.members(id) on delete set null,
  unique (session_in_id)
);
create index if not exists presence_departures_org_idx on public.presence_departures(org_id, departed_at desc);
alter table public.presence_departures enable row level security;
revoke all on public.presence_departures from public, anon, authenticated;
grant select on public.presence_departures to authenticated;
grant all on public.presence_departures to service_role;
drop policy if exists presence_departures_read on public.presence_departures;
create policy presence_departures_read on public.presence_departures for select to authenticated using (
  member_id = public.my_member_id()
  or (org_id = public.my_org_id() and (
        public.is_org_admin()
        or exists (select 1 from public.members m where m.id = presence_departures.member_id
                   and m.line_manager_id = public.my_member_id()))));

-- ───────────────────────────────────────────── work-elsewhere requests
create table if not exists public.work_location_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  member_id uuid not null references public.members on delete cascade,
  approver_id uuid references public.members(id) on delete set null,   -- line manager at request time (null → admins)
  local_date date not null,                                             -- company day the request is for
  requested_at timestamptz not null default now(),
  effective_from timestamptz not null,                                  -- when they asked / first seen outside
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m double precision check (accuracy_m >= 0 and accuracy_m <= 10000),
  radius_m int not null default 150 check (radius_m between 50 and 1000),
  place_name text check (char_length(place_name) <= 120),
  address text check (char_length(address) <= 300),
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decided_by uuid references public.members(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 500),
  checkout_attendance_id uuid references public.attendance(id) on delete set null,
  original_out_at timestamptz                                           -- if an existing check-out was moved earlier
);
create unique index if not exists work_location_requests_one_pending
  on public.work_location_requests(member_id) where status = 'pending';
create index if not exists work_location_requests_org_idx on public.work_location_requests(org_id, requested_at desc);
alter table public.work_location_requests enable row level security;
revoke all on public.work_location_requests from public, anon, authenticated;
grant select on public.work_location_requests to authenticated;
grant all on public.work_location_requests to service_role;
drop policy if exists work_location_requests_read on public.work_location_requests;
create policy work_location_requests_read on public.work_location_requests for select to authenticated using (
  member_id = public.my_member_id()
  or (org_id = public.my_org_id() and (
        public.is_org_admin()
        or approver_id = public.my_member_id()
        or exists (select 1 from public.members m where m.id = work_location_requests.member_id
                   and m.line_manager_id = public.my_member_id()))));

-- Close the session that was open at p_at: check out at p_at (or move an existing
-- later check-out back to p_at). Internal helper; not callable from the API.
create or replace function public.close_session_at(p_member uuid, p_at timestamptz, p_lat float8, p_lng float8, p_acc float8, p_flag text)
returns table (attendance_id uuid, original_out_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_in public.attendance%rowtype; v_next public.attendance%rowtype; v_tz text; v_out_at timestamptz; r public.attendance%rowtype;
begin
  select o.timezone into v_tz from public.members m join public.organizations o on o.id = m.org_id where m.id = p_member;
  -- the check-in that was open at p_at
  select * into v_in from public.attendance where member_id = p_member and kind = 'in' and at <= p_at order by at desc limit 1;
  if not found then return; end if;
  select * into v_next from public.attendance where member_id = p_member and at > v_in.at order by at limit 1;
  if found and v_next.kind = 'in' then return; end if;               -- that session already ended and a new one began
  v_out_at := greatest(p_at, v_in.at);
  if found and v_next.kind = 'out' then
    if v_next.at <= v_out_at then return; end if;                     -- they already left before that time
    update public.attendance set at = v_out_at, local_date = (v_out_at at time zone v_tz)::date,
           flags = case when p_flag = any(flags) then flags else array_append(flags, p_flag) end
     where id = v_next.id;
    attendance_id := v_next.id; original_out_at := v_next.at; return next; return;
  end if;
  insert into public.attendance(org_id, member_id, kind, at, local_date, accuracy_m, location_type, location_id,
                                distance_m, expected_mode, flags)
  values (v_in.org_id, p_member, 'out', v_out_at, (v_out_at at time zone v_tz)::date, p_acc, 'none', null,
          null, v_in.expected_mode, array[p_flag])
  returning * into r;
  if p_lat is not null and p_lng is not null then
    insert into public.private_attendance_locations(attendance_id, org_id, member_id, lat, lng)
      values (r.id, r.org_id, r.member_id, p_lat, p_lng);
  end if;
  attendance_id := r.id; original_out_at := null; return next;
end $$;
revoke all on function public.close_session_at(uuid, timestamptz, float8, float8, float8, text) from public, anon, authenticated;

-- Staff: ask to work somewhere else (now, for today).
create or replace function public.request_work_elsewhere(p_lat float8, p_lng float8, p_accuracy float8, p_reason text,
                                                         p_place_name text default null, p_address text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare m public.members%rowtype; o public.organizations%rowtype; v_open public.attendance%rowtype;
        v_dep public.presence_departures%rowtype; v_from timestamptz := now(); v_id uuid;
begin
  select * into m from public.members where user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Your account is not active yet.'; end if;
  if p_lat is null or p_lat not between -90 and 90 or p_lng is null or p_lng not between -180 and 180 then
    raise exception 'Location coordinates are invalid.'; end if;
  if p_accuracy is null or p_accuracy < 0 or p_accuracy > 10000 then raise exception 'GPS accuracy is invalid.'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a short reason for working from this place.'; end if;
  select * into o from public.organizations where id = m.org_id;
  -- A request only covers its own company day; undecided ones from earlier days lapse.
  update public.work_location_requests set status = 'cancelled', decided_at = now(),
         decision_note = coalesce(decision_note, 'Lapsed: not decided on the day')
   where member_id = m.id and status = 'pending' and local_date < (now() at time zone o.timezone)::date;
  if exists (select 1 from public.work_location_requests where member_id = m.id and status = 'pending') then
    raise exception 'You already have a request waiting for a decision.';
  end if;
  select * into v_open from public.attendance where member_id = m.id order by at desc limit 1;
  if found and v_open.kind = 'in' then
    select * into v_dep from public.presence_departures where session_in_id = v_open.id and resolution is null;
    if found then
      v_from := least(v_from, v_dep.departed_at);
      update public.presence_departures set resolution = 'requested', resolved_at = now() where id = v_dep.id;
    end if;
  end if;
  insert into public.work_location_requests(org_id, member_id, approver_id, local_date, effective_from, lat, lng,
                                            accuracy_m, radius_m, place_name, address, reason)
  values (m.org_id, m.id, m.line_manager_id, (now() at time zone o.timezone)::date, v_from, p_lat, p_lng, p_accuracy,
          greatest(o.home_radius_m, 150), nullif(trim(p_place_name), ''), nullif(trim(p_address), ''), trim(p_reason))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.request_work_elsewhere(float8, float8, float8, text, text, text) from public, anon;
grant execute on function public.request_work_elsewhere(float8, float8, float8, text, text, text) to authenticated;

create or replace function public.cancel_work_elsewhere(p_request uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  update public.work_location_requests set status = 'cancelled', decided_at = now()
   where id = p_request and member_id = public.my_member_id() and status = 'pending';
  if not found then raise exception 'There is no waiting request to cancel.'; end if;
end $$;
revoke all on function public.cancel_work_elsewhere(uuid) from public, anon;
grant execute on function public.cancel_work_elsewhere(uuid) to authenticated;

-- Line manager / admin: approve or reject.
create or replace function public.decide_work_elsewhere(p_request uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_req public.work_location_requests%rowtype; v_me uuid := public.my_member_id(); v_lm uuid; c record;
begin
  select * into v_req from public.work_location_requests where id = p_request and org_id = public.my_org_id() for update;
  if not found then raise exception 'Request not found.'; end if;
  if v_req.status <> 'pending' then raise exception 'This request has already been decided.'; end if;
  select line_manager_id into v_lm from public.members where id = v_req.member_id;
  if v_req.member_id = v_me then raise exception 'You cannot decide your own request.'; end if;
  if not (public.is_org_admin() or v_me = v_lm or v_me = v_req.approver_id) then
    raise exception 'Only this person''s line manager or an admin can decide this request.';
  end if;
  if not p_approve and char_length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'Give a short reason for rejecting.';
  end if;

  update public.work_location_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = v_me, decided_at = now(), decision_note = nullif(trim(p_note), '')
   where id = v_req.id;

  update public.presence_departures set resolution = case when p_approve then 'approved' else 'rejected' end,
         resolved_at = now(), resolved_by = v_me
   where member_id = v_req.member_id and resolution = 'requested';

  if not p_approve then
    for c in select * from public.close_session_at(v_req.member_id, v_req.effective_from, v_req.lat, v_req.lng,
                                                   v_req.accuracy_m, 'left_unapproved') loop
      update public.work_location_requests set checkout_attendance_id = c.attendance_id, original_out_at = c.original_out_at
       where id = v_req.id;
    end loop;
  end if;
end $$;
revoke all on function public.decide_work_elsewhere(uuid, boolean, text) from public, anon;
grant execute on function public.decide_work_elsewhere(uuid, boolean, text) to authenticated;

-- Line manager / admin: someone left and never asked → end their session at the time they left.
create or replace function public.end_session_at_departure(p_departure uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare d public.presence_departures%rowtype; v_me uuid := public.my_member_id(); v_lm uuid;
begin
  select * into d from public.presence_departures where id = p_departure and org_id = public.my_org_id() for update;
  if not found then raise exception 'Not found.'; end if;
  if d.resolution is not null then raise exception 'This has already been handled.'; end if;
  select line_manager_id into v_lm from public.members where id = d.member_id;
  if d.member_id = v_me then raise exception 'You cannot end your own session this way.'; end if;
  if not (public.is_org_admin() or v_me = v_lm) then
    raise exception 'Only this person''s line manager or an admin can do this.';
  end if;
  perform public.close_session_at(d.member_id, d.departed_at, d.lat, d.lng, d.accuracy_m, 'left_unapproved');
  update public.presence_departures set resolution = 'ended_by_manager', resolved_at = now(), resolved_by = v_me where id = d.id;
end $$;
revoke all on function public.end_session_at_departure(uuid) from public, anon;
grant execute on function public.end_session_at_departure(uuid) to authenticated;

-- Approved places a person may work from right now (office / home / approved request today).
create or replace function public.inside_approved_place(p_member uuid, p_lat float8, p_lng float8, p_accuracy float8)
returns text language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare m public.members%rowtype; o public.organizations%rowtype; h public.member_private_locations%rowtype;
        v_tol float8 := least(coalesce(p_accuracy, 0), 50); v_date date;
begin
  select * into m from public.members where id = p_member;
  select * into o from public.organizations where id = m.org_id;
  if exists (select 1 from public.locations l where l.org_id = m.org_id
             and public.distance_m(p_lat, p_lng, l.lat, l.lng) <= l.radius_m + v_tol) then return 'office'; end if;
  select * into h from public.member_private_locations where member_id = m.id;
  if h.home_lat is not null and public.distance_m(p_lat, p_lng, h.home_lat, h.home_lng) <= o.home_radius_m + v_tol then
    return 'home'; end if;
  v_date := (now() at time zone o.timezone)::date;
  if exists (select 1 from public.work_location_requests r where r.member_id = m.id and r.status = 'approved'
             and r.local_date = v_date and public.distance_m(p_lat, p_lng, r.lat, r.lng) <= r.radius_m + v_tol) then
    return 'elsewhere'; end if;
  return null;
end $$;
revoke all on function public.inside_approved_place(uuid, float8, float8, float8) from public, anon, authenticated;

-- Called by the app every 15 minutes while the person is checked in and 5ime is open.
create or replace function public.report_presence(p_lat float8, p_lng float8, p_accuracy float8)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare m public.members%rowtype; v_open public.attendance%rowtype; v_place text; v_dep public.presence_departures%rowtype;
        v_req public.work_location_requests%rowtype;
begin
  select * into m from public.members where user_id = auth.uid() and status = 'active';
  if not found then return jsonb_build_object('status', 'inactive'); end if;
  if p_lat is null or p_lat not between -90 and 90 or p_lng is null or p_lng not between -180 and 180 then
    raise exception 'Location coordinates are invalid.'; end if;
  select * into v_open from public.attendance where member_id = m.id order by at desc limit 1;
  if not found or v_open.kind <> 'in' then return jsonb_build_object('status', 'not_checked_in'); end if;
  select * into v_req from public.work_location_requests where member_id = m.id and status in ('pending','approved')
   order by requested_at desc limit 1;
  if coalesce(p_accuracy, 9999) > 150 then
    return jsonb_build_object('status', 'weak_signal', 'request_status', v_req.status);
  end if;
  v_place := public.inside_approved_place(m.id, p_lat, p_lng, p_accuracy);
  select * into v_dep from public.presence_departures where session_in_id = v_open.id;
  if v_place is not null then
    if found and v_dep.resolution is null then
      update public.presence_departures set returned_at = now(), resolution = 'returned', resolved_at = now() where id = v_dep.id;
    end if;
    return jsonb_build_object('status', 'inside', 'place', v_place, 'request_status', v_req.status);
  end if;
  if not found then
    insert into public.presence_departures(org_id, member_id, session_in_id, lat, lng, accuracy_m)
      values (m.org_id, m.id, v_open.id, p_lat, p_lng, p_accuracy)
      returning * into v_dep;
  end if;
  return jsonb_build_object('status', 'outside', 'departed_at', v_dep.departed_at,
                            'request_status', v_req.status, 'departure_resolution', v_dep.resolution);
end $$;
revoke all on function public.report_presence(float8, float8, float8) from public, anon;
grant execute on function public.report_presence(float8, float8, float8) to authenticated;

-- ───────────────────────────────────────────── home location with address
create or replace function public.request_home_location(p_lat float8, p_lng float8, p_accuracy float8, p_address text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.request_home_location(p_lat, p_lng, p_accuracy);
  update public.member_private_locations set home_req_address = nullif(left(trim(p_address), 300), '')
   where member_id = public.my_member_id();
end $$;
revoke all on function public.request_home_location(float8, float8, float8, text) from public, anon;
grant execute on function public.request_home_location(float8, float8, float8, text) to authenticated;

-- Approving a home copies its address too.
create or replace function public.copy_home_address_on_approve()
returns trigger language plpgsql set search_path = pg_catalog, public, pg_temp as $$
begin
  if new.home_req_lat is null and old.home_req_lat is not null then
    if new.home_lat is not distinct from old.home_req_lat and new.home_lng is not distinct from old.home_req_lng then
      new.home_address := old.home_req_address;          -- approved
    end if;
    new.home_req_address := null;                         -- approved or rejected: request cleared
  end if;
  return new;
end $$;
drop trigger if exists member_private_locations_address on public.member_private_locations;
create trigger member_private_locations_address before update on public.member_private_locations
  for each row execute function public.copy_home_address_on_approve();

-- ───────────────────────────────────────────── check-in accepts an approved place
create or replace function public.check_in(p_kind text, p_lat float8, p_lng float8, p_accuracy float8, p_user_agent text default null)
returns public.attendance language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare m public.members%rowtype; o public.organizations%rowtype; s public.subscriptions%rowtype;
  h public.member_private_locations%rowtype; r public.attendance%rowtype; v_open public.attendance%rowtype;
  v_at timestamptz; v_local timestamp; v_date date; v_dow int; v_mode text; v_last_kind text;
  v_loc_id uuid; v_loc_dist float8; v_loc_radius int; v_home_dist float8; v_req_dist float8;
  v_type text := 'none'; v_match_id uuid; v_dist float8; v_tol float8;
  v_flags text[] := '{}'; v_ip text;
begin
  select * into m from public.members where user_id=auth.uid() and status='active';
  if not found then raise exception 'Your account is not active yet. Ask your admin to approve you.'; end if;
  if p_kind not in ('in','out') then raise exception 'Invalid action.'; end if;
  if p_lat is null or p_lat not between -90 and 90 or p_lng is null or p_lng not between -180 and 180 then raise exception 'Location coordinates are invalid.'; end if;
  if p_accuracy is null or p_accuracy < 0 or p_accuracy > 10000 then raise exception 'GPS accuracy is invalid. Try again with a fresh location reading.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(m.id::text, 0));
  select * into o from public.organizations where id=m.org_id;
  select * into s from public.subscriptions where org_id=m.org_id;
  if s.status='cancelled'
    or (s.cancel_at_period_end and s.current_period_end <= now())
    or (s.status='trialing' and s.trial_ends_at < now())
    or (s.status in ('active','past_due') and s.current_period_end < now()-interval '3 days') then
    raise exception 'Your company''s 5ime subscription has expired. Please contact your admin.';
  end if;
  if s.status in ('active','past_due') and (select count(*) from public.members where org_id=m.org_id and status='active') > s.seats_paid then
    raise exception 'Your company needs to add seats before check-ins can continue.';
  end if;

  v_at := clock_timestamp();
  v_local := v_at at time zone o.timezone;
  v_date := v_local::date;
  v_dow := extract(isodow from v_local);
  select * into v_open from public.attendance where member_id=m.id order by at desc limit 1;
  v_last_kind := v_open.kind;
  if p_kind='in' and v_last_kind='in' then raise exception 'You are already checked in.'; end if;
  if p_kind='out' and v_last_kind is distinct from 'in' then raise exception 'You have not checked in.'; end if;

  if p_kind='out' then
    v_mode := coalesce(v_open.expected_mode,'office');
  else
    select mode into v_mode from public.schedules where org_id=m.org_id and member_id=m.id and weekday=v_dow;
    if v_mode is null then select mode into v_mode from public.schedules where org_id=m.org_id and member_id is null and weekday=v_dow; end if;
    v_mode := coalesce(v_mode,'office');
  end if;

  v_tol := least(p_accuracy,50);
  select l.id,d.dist,l.radius_m into v_loc_id,v_loc_dist,v_loc_radius
    from public.locations l cross join lateral (select public.distance_m(p_lat,p_lng,l.lat,l.lng) as dist) d
   where l.org_id=m.org_id and d.dist <= l.radius_m+v_tol order by d.dist limit 1;
  if not found then
    select l.id,public.distance_m(p_lat,p_lng,l.lat,l.lng),l.radius_m into v_loc_id,v_loc_dist,v_loc_radius
      from public.locations l where l.org_id=m.org_id order by public.distance_m(p_lat,p_lng,l.lat,l.lng) limit 1;
    v_loc_id := null;
  else
    v_type := 'office'; v_match_id := v_loc_id; v_dist := v_loc_dist;
  end if;

  select * into h from public.member_private_locations where member_id=m.id;
  if h.home_lat is not null then
    v_home_dist := public.distance_m(p_lat,p_lng,h.home_lat,h.home_lng);
    if v_type='none' and v_home_dist <= o.home_radius_m+v_tol then v_type:='home'; v_dist:=v_home_dist; end if;
  end if;

  -- A place approved by the line manager for today counts as approved.
  if v_type='none' then
    select public.distance_m(p_lat,p_lng,q.lat,q.lng) into v_req_dist
      from public.work_location_requests q
     where q.member_id=m.id and q.status='approved' and q.local_date=v_date
       and public.distance_m(p_lat,p_lng,q.lat,q.lng) <= q.radius_m+v_tol
     order by public.distance_m(p_lat,p_lng,q.lat,q.lng) limit 1;
    if found then v_type:='elsewhere'; v_dist:=v_req_dist; end if;
  end if;

  if v_type='none' then
    v_dist := least(coalesce(v_loc_dist,'infinity'::float8),coalesce(v_home_dist,'infinity'::float8));
    if v_dist='infinity'::float8 then v_dist:=null; end if;
  end if;

  if p_accuracy > 100 then v_flags:=array_append(v_flags,'low_accuracy'); end if;
  if v_mode='off' then v_flags:=array_append(v_flags,'off_day');
  elsif v_type='none' then v_flags:=array_append(v_flags,'out_of_range');
  elsif v_type<>v_mode and v_type<>'elsewhere' then v_flags:=array_append(v_flags,'wrong_location'); end if;
  if v_mode='home' and h.home_lat is null then v_flags:=array_append(v_flags,'home_not_set'); end if;
  if p_kind='in' and v_local::time > o.work_start+make_interval(mins=>o.grace_minutes) then v_flags:=array_append(v_flags,'late'); end if;
  if p_kind='out' and v_open.local_date=v_date and v_local::time < o.work_end then v_flags:=array_append(v_flags,'early_exit'); end if;

  begin
    v_ip := nullif(trim(split_part(coalesce(current_setting('request.headers',true)::json->>'x-forwarded-for',''),',',1)),'');
  exception when others then v_ip:=null;
  end;
  insert into public.attendance(org_id,member_id,kind,at,local_date,accuracy_m,location_type,location_id,distance_m,expected_mode,flags,ip,user_agent)
  values(m.org_id,m.id,p_kind,v_at,v_date,p_accuracy,v_type,v_match_id,round(v_dist::numeric,1),v_mode,v_flags,v_ip,left(p_user_agent,300))
  returning * into r;
  insert into public.private_attendance_locations(attendance_id,org_id,member_id,lat,lng)
    values(r.id,m.org_id,m.id,p_lat,p_lng);
  return r;
end $$;
revoke execute on function public.check_in(text,float8,float8,float8,text) from public, anon;
grant execute on function public.check_in(text,float8,float8,float8,text) to authenticated;

commit;
