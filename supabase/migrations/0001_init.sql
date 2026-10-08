-- 5ime — hybrid attendance SaaS
-- Run in Supabase: SQL Editor → paste → Run (or `supabase db push`).
-- Multi-tenant: every row carries org_id; row-level security keeps companies apart.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────── tables

create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) between 2 and 120),
  domain        text not null unique,                 -- company email domain, e.g. acme.com
  timezone      text not null default 'Africa/Lagos',
  work_start    time not null default '09:00',
  work_end      time not null default '17:00',
  grace_minutes int  not null default 15 check (grace_minutes between 0 and 180),
  home_radius_m int  not null default 150 check (home_radius_m between 50 and 1000),
  created_at    timestamptz not null default now()
);

create table public.subscriptions (
  org_id             uuid primary key references public.organizations on delete cascade,
  plan               text not null default 'pro' check (plan in ('basic','pro')),
  status             text not null default 'trialing' check (status in ('trialing','active','past_due','cancelled')),
  trial_ends_at      timestamptz,
  current_period_end timestamptz,
  seats_paid         int not null default 0,
  paystack_customer  text,
  last_reference     text,
  updated_at         timestamptz not null default now()
);

create table public.members (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations on delete cascade,
  user_id      uuid unique references auth.users on delete set null,
  email        text not null,
  full_name    text,
  role         text not null default 'staff'  check (role in ('owner','admin','manager','staff')),
  status       text not null default 'active' check (status in ('invited','pending','active','disabled')),
  team         text,
  -- approved home location (used for check-in)
  home_lat     double precision,
  home_lng     double precision,
  home_status  text not null default 'none' check (home_status in ('none','pending','approved','rejected')),
  -- requested (awaiting admin approval)
  home_req_lat double precision,
  home_req_lng double precision,
  home_req_acc double precision,
  home_req_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index members_email_key on public.members (lower(email));
create index members_org_idx on public.members (org_id);

create table public.locations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations on delete cascade,
  name       text not null,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  radius_m   int not null default 200,
  created_at timestamptz not null default now()
);
create index locations_org_idx on public.locations (org_id);

-- member_id null = company default; a row with member_id overrides for that person (Pro)
create table public.schedules (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.organizations on delete cascade,
  member_id uuid references public.members on delete cascade,
  weekday   int  not null check (weekday between 1 and 7),   -- ISO: 1 = Monday
  mode      text not null check (mode in ('office','home','off')),
  unique nulls not distinct (org_id, member_id, weekday)
);

create table public.attendance (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations on delete cascade,
  member_id     uuid not null references public.members on delete cascade,
  kind          text not null check (kind in ('in','out')),
  at            timestamptz not null default now(),
  local_date    date not null,
  lat           double precision,
  lng           double precision,
  accuracy_m    double precision,
  location_type text not null check (location_type in ('office','home','none')),
  location_id   uuid references public.locations on delete set null,
  distance_m    double precision,
  expected_mode text,
  flags         text[] not null default '{}',
  ip            text,
  user_agent    text
);
create index attendance_org_date_idx on public.attendance (org_id, local_date);
create index attendance_member_date_idx on public.attendance (member_id, local_date);

-- ─────────────────────────────────────────────────────────── helpers

create or replace function public.distance_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

create or replace function public.is_public_email_domain(d text)
returns boolean language sql immutable as $$
  select lower(coalesce(d, '')) = any (array[
    '', 'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','ymail.com','rocketmail.com',
    'hotmail.com','outlook.com','live.com','msn.com','icloud.com','me.com','mac.com',
    'aol.com','proton.me','protonmail.com','gmx.com','mail.com','yandex.com','zoho.com'
  ]);
$$;

create or replace function public.my_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from members where user_id = auth.uid() and status = 'active' limit 1;
$$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from members where user_id = auth.uid() and status = 'active' limit 1;
$$;

create or replace function public.is_org_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('owner','admin'), false);
$$;

create or replace function public.is_org_viewer()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('owner','admin','manager'), false);
$$;

create or replace function public.current_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- ─────────────────────────────────────────────────────────── row-level security

alter table public.organizations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.members       enable row level security;
alter table public.locations     enable row level security;
alter table public.schedules     enable row level security;
alter table public.attendance    enable row level security;

create policy org_read   on public.organizations for select using (id = public.my_org_id());
create policy org_update on public.organizations for update using (id = public.my_org_id() and public.is_org_admin());
revoke update on public.organizations from authenticated, anon;
grant update (name, timezone, work_start, work_end, grace_minutes, home_radius_m) on public.organizations to authenticated;

create policy sub_read on public.subscriptions for select
  using (org_id = public.my_org_id() and public.is_org_admin());

create policy member_read on public.members for select
  using (user_id = auth.uid() or (org_id = public.my_org_id() and public.is_org_viewer()));
create policy member_update on public.members for update
  using (org_id = public.my_org_id() and public.is_org_admin());
create policy member_delete on public.members for delete
  using (org_id = public.my_org_id() and public.is_org_admin() and role <> 'owner');
revoke update on public.members from authenticated, anon;
grant update (full_name, role, status, team) on public.members to authenticated;

create policy loc_read  on public.locations for select using (org_id = public.my_org_id());
create policy loc_write on public.locations for all
  using (org_id = public.my_org_id() and public.is_org_admin())
  with check (org_id = public.my_org_id() and public.is_org_admin());

create policy sched_read  on public.schedules for select using (org_id = public.my_org_id());
create policy sched_write on public.schedules for all
  using (org_id = public.my_org_id() and public.is_org_admin())
  with check (org_id = public.my_org_id() and public.is_org_admin());

create policy att_read on public.attendance for select using (
  exists (select 1 from public.members m where m.id = attendance.member_id and m.user_id = auth.uid())
  or (org_id = public.my_org_id() and public.is_org_viewer())
);
-- No insert/update/delete policies on attendance: rows are only written by check_in().

-- ─────────────────────────────────────────────────────────── guards

create or replace function public.guard_member_changes()
returns trigger language plpgsql as $$
begin
  if old.role = 'owner' and (new.role <> 'owner' or new.status <> 'active') then
    raise exception 'The company owner cannot be demoted or disabled.';
  end if;
  if new.role = 'owner' and old.role <> 'owner' then
    raise exception 'Ownership cannot be assigned here.';
  end if;
  if new.role = 'manager' and old.role <> 'manager'
     and (select plan from subscriptions where org_id = new.org_id) = 'basic' then
    raise exception 'The Manager role is a Pro feature.';
  end if;
  return new;
end $$;
create trigger members_guard before update on public.members
  for each row execute function public.guard_member_changes();

create or replace function public.enforce_location_plan()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_plan text;
begin
  select plan into v_plan from subscriptions where org_id = new.org_id;
  if v_plan = 'basic' then
    new.radius_m := 200;
    if tg_op = 'INSERT' and (select count(*) from locations where org_id = new.org_id) >= 1 then
      raise exception 'The Basic plan includes 1 office location. Upgrade to Pro for multiple offices.';
    end if;
  end if;
  if new.radius_m < 50 or new.radius_m > 2000 then
    raise exception 'Radius must be between 50m and 2000m.';
  end if;
  return new;
end $$;
create trigger locations_plan before insert or update on public.locations
  for each row execute function public.enforce_location_plan();

-- ─────────────────────────────────────────────────────────── RPCs

-- Called after every sign-in. Links invites, auto-joins by company domain (pending approval).
create or replace function public.join_organization()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_email  text := public.current_email();
  v_domain text := split_part(public.current_email(), '@', 2);
  v_name   text := coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name');
  m members;
  v_org uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select * into m from members where user_id = auth.uid();
  if found then return json_build_object('status', m.status, 'role', m.role); end if;

  select * into m from members where lower(email) = v_email and user_id is null;
  if found then
    update members
       set user_id = auth.uid(),
           status = case when status = 'invited' then 'active' else status end,
           full_name = coalesce(full_name, v_name)
     where id = m.id
     returning * into m;
    return json_build_object('status', m.status, 'role', m.role);
  end if;

  if public.is_public_email_domain(v_domain) then
    return json_build_object('status', 'public_email');
  end if;

  select id into v_org from organizations where domain = v_domain;
  if found then
    insert into members (org_id, user_id, email, full_name, role, status)
    values (v_org, auth.uid(), v_email, v_name, 'staff', 'pending')
    returning * into m;
    return json_build_object('status', 'pending', 'role', 'staff');
  end if;

  return json_build_object('status', 'no_org', 'domain', v_domain);
end $$;

create or replace function public.create_organization(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_email  text := public.current_email();
  v_domain text := split_part(public.current_email(), '@', 2);
  v_name   text := coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name');
  v_org uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if public.is_public_email_domain(v_domain) then
    raise exception 'Please sign in with your company email address (not Gmail, Yahoo, Outlook, etc.).';
  end if;
  if exists (select 1 from members where user_id = auth.uid()) then
    raise exception 'You already belong to a company.';
  end if;
  if exists (select 1 from organizations where domain = v_domain) then
    raise exception 'A company using @% is already on 5ime. Ask your admin to invite you.', v_domain;
  end if;

  insert into organizations (name, domain) values (trim(p_name), v_domain) returning id into v_org;
  insert into members (org_id, user_id, email, full_name, role, status)
    values (v_org, auth.uid(), v_email, v_name, 'owner', 'active');
  insert into subscriptions (org_id, plan, status, trial_ends_at)
    values (v_org, 'pro', 'trialing', now() + interval '14 days');
  insert into schedules (org_id, member_id, weekday, mode)
    select v_org, null, d, case when d <= 5 then 'office' else 'off' end from generate_series(1, 7) d;
  return v_org;
end $$;

create or replace function public.invite_member(p_email text, p_name text, p_role text default 'staff', p_team text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.my_org_id();
  v_domain text;
  v_email text := lower(trim(p_email));
  v_id uuid;
begin
  if not public.is_org_admin() then raise exception 'Only admins can invite staff.'; end if;
  if p_role not in ('admin','manager','staff') then raise exception 'Invalid role.'; end if;
  select domain into v_domain from organizations where id = v_org;
  if split_part(v_email, '@', 2) <> v_domain then
    raise exception '% is not a @% address.', v_email, v_domain;
  end if;
  if p_role = 'manager' and (select plan from subscriptions where org_id = v_org) = 'basic' then
    raise exception 'The Manager role is a Pro feature.';
  end if;
  insert into members (org_id, email, full_name, role, status, team)
    values (v_org, v_email, nullif(trim(p_name), ''), p_role, 'invited', nullif(trim(p_team), ''))
    returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception '% has already been added.', v_email;
end $$;

create or replace function public.request_home_location(p_lat float8, p_lng float8, p_accuracy float8)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_accuracy is null or p_accuracy > 100 then
    raise exception 'GPS accuracy is too low (±%m). Go outside or near a window and try again.', round(coalesce(p_accuracy, 9999));
  end if;
  update members
     set home_req_lat = p_lat, home_req_lng = p_lng, home_req_acc = p_accuracy,
         home_req_at = now(), home_status = 'pending'
   where user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Your account is not active yet.'; end if;
end $$;

create or replace function public.review_home_location(p_member uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_admin() then raise exception 'Only admins can approve home locations.'; end if;
  update members
     set home_lat    = case when p_approve then home_req_lat else home_lat end,
         home_lng    = case when p_approve then home_req_lng else home_lng end,
         home_status = case when p_approve then 'approved'
                            when home_lat is not null then 'approved'
                            else 'rejected' end,
         home_req_lat = null, home_req_lng = null, home_req_acc = null, home_req_at = null
   where id = p_member and org_id = public.my_org_id() and home_req_lat is not null;
  if not found then raise exception 'No pending home location for this person.'; end if;
end $$;

create or replace function public.check_in(p_kind text, p_lat float8, p_lng float8, p_accuracy float8, p_user_agent text default null)
returns public.attendance language plpgsql security definer set search_path = public as $$
declare
  m members; o organizations; s subscriptions; r attendance;
  v_local timestamp; v_date date; v_dow int; v_mode text;
  v_last_kind text;
  v_loc_id uuid; v_loc_dist float8; v_loc_radius int;
  v_home_dist float8;
  v_type text := 'none'; v_match_id uuid; v_dist float8;
  v_tol float8 := least(coalesce(p_accuracy, 50), 50);
  v_flags text[] := '{}';
  v_ip text;
begin
  select * into m from members where user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Your account is not active yet. Ask your admin to approve you.'; end if;
  if p_kind not in ('in','out') then raise exception 'Invalid action.'; end if;
  if p_lat is null or p_lng is null then raise exception 'Location is required to check in.'; end if;

  select * into o from organizations where id = m.org_id;
  select * into s from subscriptions where org_id = m.org_id;
  if s.status = 'cancelled'
     or (s.status = 'trialing' and s.trial_ends_at < now())
     or (s.status in ('active','past_due') and s.current_period_end < now() - interval '3 days') then
    raise exception 'Your company''s 5ime subscription has expired. Please contact your admin.';
  end if;

  v_local := now() at time zone o.timezone;
  v_date  := v_local::date;
  v_dow   := extract(isodow from v_local);

  select kind into v_last_kind from attendance
   where member_id = m.id and local_date = v_date order by at desc limit 1;
  if p_kind = 'in'  and v_last_kind = 'in' then raise exception 'You are already checked in.'; end if;
  if p_kind = 'out' and coalesce(v_last_kind, 'out') = 'out' then raise exception 'You have not checked in today.'; end if;

  select mode into v_mode from schedules where member_id = m.id and weekday = v_dow;
  if v_mode is null then
    select mode into v_mode from schedules where org_id = m.org_id and member_id is null and weekday = v_dow;
  end if;
  v_mode := coalesce(v_mode, 'office');

  select l.id, public.distance_m(p_lat, p_lng, l.lat, l.lng), l.radius_m
    into v_loc_id, v_loc_dist, v_loc_radius
    from locations l where l.org_id = m.org_id
   order by public.distance_m(p_lat, p_lng, l.lat, l.lng) limit 1;

  if v_loc_id is not null and v_loc_dist <= v_loc_radius + v_tol then
    v_type := 'office'; v_match_id := v_loc_id; v_dist := v_loc_dist;
  end if;

  if m.home_lat is not null then
    v_home_dist := public.distance_m(p_lat, p_lng, m.home_lat, m.home_lng);
    if v_type = 'none' and v_home_dist <= o.home_radius_m + v_tol then
      v_type := 'home'; v_dist := v_home_dist;
    end if;
  end if;

  if v_type = 'none' then
    v_dist := least(coalesce(v_loc_dist, 'infinity'::float8), coalesce(v_home_dist, 'infinity'::float8));
    if v_dist = 'infinity'::float8 then v_dist := null; end if;
  end if;

  if coalesce(p_accuracy, 9999) > 100 then v_flags := array_append(v_flags, 'low_accuracy'); end if;
  if v_mode = 'off' then
    v_flags := array_append(v_flags, 'off_day');
  elsif v_type = 'none' then
    v_flags := array_append(v_flags, 'out_of_range');
  elsif v_type <> v_mode then
    v_flags := array_append(v_flags, 'wrong_location');
  end if;
  if v_mode = 'home' and m.home_lat is null then v_flags := array_append(v_flags, 'home_not_set'); end if;
  if p_kind = 'in'  and v_local::time > o.work_start + make_interval(mins => o.grace_minutes) then
    v_flags := array_append(v_flags, 'late');
  end if;
  if p_kind = 'out' and v_local::time < o.work_end then v_flags := array_append(v_flags, 'early_exit'); end if;

  begin
    v_ip := nullif(trim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), '');
  exception when others then v_ip := null;
  end;

  insert into attendance (org_id, member_id, kind, local_date, lat, lng, accuracy_m,
                          location_type, location_id, distance_m, expected_mode, flags, ip, user_agent)
  values (m.org_id, m.id, p_kind, v_date, p_lat, p_lng, p_accuracy,
          v_type, v_match_id, round(v_dist::numeric, 1), v_mode, v_flags, v_ip, left(p_user_agent, 300))
  returning * into r;
  return r;
end $$;

-- Lock down helper execution to signed-in users only
revoke execute on function public.join_organization()                         from anon;
revoke execute on function public.create_organization(text)                   from anon;
revoke execute on function public.invite_member(text, text, text, text)       from anon;
revoke execute on function public.request_home_location(float8, float8, float8) from anon;
revoke execute on function public.review_home_location(uuid, boolean)         from anon;
revoke execute on function public.check_in(text, float8, float8, float8, text) from anon;
