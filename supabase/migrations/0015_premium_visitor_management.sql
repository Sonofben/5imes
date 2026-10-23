-- 5ime: Premium plan + visitor management (VMS). Apply after 0014.
--
-- Premium = everything in Pro + visitors: invitations with a QR pass, a paired reception
-- tablet for sign-in/out, host email alerts, who's on site, blocklist, visitor log, and
-- automatic deletion of visitor details after a retention period. Companies on a free
-- trial can use visitor management too, so they can try it before choosing a plan.
begin;

-- ───────────────────────────────────────────── Premium plan
alter table public.subscriptions  drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions  add  constraint subscriptions_plan_check  check (plan in ('basic','pro','premium'));
alter table public.payments       drop constraint if exists payments_plan_check;
alter table public.payments       add  constraint payments_plan_check       check (plan in ('basic','pro','premium'));
alter table public.platform_plans drop constraint if exists platform_plans_plan_check;
alter table public.platform_plans add  constraint platform_plans_plan_check check (plan in ('basic','pro','premium'));

insert into public.platform_plans (plan, name, price_naira, blurb, features, max_locations) values
  ('premium', 'Premium', 1000, 'For offices that welcome visitors.',
   array['Everything in Pro',
         'Visitor invitations with a QR pass by email',
         'Reception tablet: visitors sign in and out',
         'Host alert the moment a visitor arrives',
         'Who’s on site: staff and visitors, for fire drills',
         'Visitor blocklist and visitor log with CSV export',
         'Visitor details deleted automatically after a set time'], null)
on conflict (plan) do nothing;

-- Functions that list the plans or treat Pro as the top plan now include Premium.
do $$
declare r record; v_def text; v_new text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and (pg_get_functiondef(p.oid) ~ '''basic'',\s*''pro''\)' or pg_get_functiondef(p.oid) ~ 'plan <> ''pro''' or pg_get_functiondef(p.oid) ~ 'Basic or Pro')
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := regexp_replace(v_def, '''basic'',(\s*)''pro''\)', '''basic'',\1''pro'',\1''premium'')', 'g');
    v_new := regexp_replace(v_new, '(\w+)\.plan <> ''pro''', '\1.plan not in (''pro'',''premium'')', 'g');
    v_new := replace(v_new, 'Choose Basic or Pro.', 'Choose Basic, Pro or Premium.');
    if v_new <> v_def then execute v_new; end if;
  end loop;
end $$;

-- Does a company have Premium features right now? (Premium plan in good standing, or a live trial.)
create or replace function public.org_has_premium(p_org uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select coalesce((
    select (s.status = 'trialing' and s.trial_ends_at >= now())
        or (s.plan = 'premium' and s.status in ('active','past_due')
            and coalesce(s.current_period_end, now()) >= now() - interval '3 days'
            and not (s.cancel_at_period_end and s.current_period_end <= now()))
      from public.subscriptions s where s.org_id = p_org), false)
$$;
revoke all on function public.org_has_premium(uuid) from public, anon;
grant execute on function public.org_has_premium(uuid) to authenticated, service_role;

create or replace function public.require_premium(p_org uuid)
returns void language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if p_org is null then raise exception using errcode = 'KF401', message = 'Sign in again to continue.'; end if;
  if not public.org_has_premium(p_org) then
    raise exception using errcode = 'KF403', message = 'Visitor management is part of the Premium plan. An admin can upgrade under Billing.';
  end if;
end $$;
revoke all on function public.require_premium(uuid) from public, anon, authenticated;

-- Short random codes without pgcrypto (Supabase keeps pgcrypto in another schema).
-- Letters and digits that can't be confused when read aloud or typed (no 0/O, 1/I/L).
create or replace function public.random_code(p_len integer)
returns text language plpgsql volatile set search_path = pg_catalog, public, pg_temp as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex');
  out text := '';
begin
  for i in 0 .. least(p_len, 32) - 1 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return out;
end $$;
revoke all on function public.random_code(integer) from public, anon, authenticated;

create or replace function public.token_hash(p_token text)
returns text language sql immutable set search_path = pg_catalog, public, pg_temp as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
$$;
revoke all on function public.token_hash(text) from public, anon, authenticated;

-- ───────────────────────────────────────────── tables
alter table public.locations add column if not exists address text;   -- (added in 0011; repeated so this file stands alone)

create table if not exists public.visitor_settings (
  org_id          uuid primary key references public.organizations on delete cascade,
  photo_required  boolean not null default false,
  rules_text      text not null default 'By signing in you agree to follow our safety rules, wear your visitor badge, and stay with your host.'
                  check (char_length(rules_text) between 1 and 2000),
  retention_days  integer not null default 90 check (retention_days between 7 and 365),
  notify_host     boolean not null default true,
  updated_at      timestamptz not null default now()
);

create table if not exists public.visits (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations on delete cascade,
  location_id      uuid references public.locations on delete set null,
  host_member_id   uuid references public.members on delete set null,
  visitor_name     text not null check (char_length(visitor_name) between 1 and 120),
  visitor_email    text check (visitor_email is null or char_length(visitor_email) <= 254),
  visitor_phone    text check (visitor_phone is null or char_length(visitor_phone) <= 30),
  visitor_company  text check (visitor_company is null or char_length(visitor_company) <= 120),
  purpose          text check (purpose is null or char_length(purpose) <= 200),
  expected_at      timestamptz,
  code             text not null unique,            -- typed or scanned at the tablet
  pass_token_hash  text unique,                     -- the visitor's pass link (only the hash is kept)
  status           text not null default 'expected' check (status in ('expected','on_site','left','cancelled','denied')),
  walk_in          boolean not null default false,
  signed_in_at     timestamptz,
  signed_out_at    timestamptz,
  sign_in_source   text check (sign_in_source is null or sign_in_source in ('tablet','staff')),
  rules_accepted_at timestamptz,
  photo_path       text,
  denied_reason    text,
  personal_data_deleted_at timestamptz,
  created_by       uuid references public.members on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists visits_org_time_idx on public.visits (org_id, coalesce(signed_in_at, expected_at, created_at) desc);
create index if not exists visits_host_idx on public.visits (host_member_id, status);

create table if not exists public.visitor_blocklist (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations on delete cascade,
  name        text check (name is null or char_length(name) between 2 and 120),
  email       text check (email is null or char_length(email) <= 254),
  phone       text check (phone is null or char_length(phone) <= 30),
  reason      text check (reason is null or char_length(reason) <= 300),
  created_by  uuid references public.members on delete set null,
  created_at  timestamptz not null default now(),
  check (name is not null or email is not null or phone is not null)
);
create index if not exists visitor_blocklist_org_idx on public.visitor_blocklist (org_id);

create table if not exists public.kiosk_devices (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations on delete cascade,
  location_id        uuid not null references public.locations on delete cascade,
  name               text not null check (char_length(name) between 1 and 60),
  token_hash         text unique,
  pairing_code_hash  text,
  pairing_expires_at timestamptz,
  paired_at          timestamptz,
  last_seen_at       timestamptz,
  revoked_at         timestamptz,
  created_by         uuid references public.members on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists kiosk_devices_org_idx on public.kiosk_devices (org_id);

-- Phone and email are compared in a normal form (digits only / lower case).
create or replace function public.norm_phone(p text) returns text language sql immutable set search_path = pg_catalog, public, pg_temp as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '')
$$;
create or replace function public.norm_email(p text) returns text language sql immutable set search_path = pg_catalog, public, pg_temp as $$
  select nullif(lower(trim(coalesce(p, ''))), '')
$$;
create or replace function public.norm_name(p text) returns text language sql immutable set search_path = pg_catalog, public, pg_temp as $$
  select nullif(regexp_replace(lower(trim(coalesce(p, ''))), '\s+', ' ', 'g'), '')
$$;

-- ───────────────────────────────────────────── row-level security and grants
alter table public.visitor_settings  enable row level security;
alter table public.visits            enable row level security;
alter table public.visitor_blocklist enable row level security;
alter table public.kiosk_devices     enable row level security;
revoke all on public.visitor_settings, public.visits, public.visitor_blocklist, public.kiosk_devices from public, anon, authenticated;
grant all on public.visitor_settings, public.visits, public.visitor_blocklist, public.kiosk_devices to service_role;

-- Settings: everyone in the company can read them (the invite form shows the rules).
drop policy if exists vs_read on public.visitor_settings;
create policy vs_read on public.visitor_settings for select using (org_id = public.my_org_id());
grant select on public.visitor_settings to authenticated;

-- Visits: admins and managers see the company's visits; staff see the visits they host or created.
-- The pass token hash is never readable; the photo path only through the server.
drop policy if exists visits_read on public.visits;
create policy visits_read on public.visits for select using (
  org_id = public.my_org_id()
  and (public.is_org_viewer() or host_member_id = public.my_member_id() or created_by = public.my_member_id()));
grant select (id, org_id, location_id, host_member_id, visitor_name, visitor_email, visitor_phone, visitor_company, purpose,
              expected_at, code, status, walk_in, signed_in_at, signed_out_at, sign_in_source, rules_accepted_at,
              denied_reason, personal_data_deleted_at, created_by, created_at) on public.visits to authenticated;

drop policy if exists blocklist_read on public.visitor_blocklist;
create policy blocklist_read on public.visitor_blocklist for select using (org_id = public.my_org_id() and public.is_org_admin());
grant select on public.visitor_blocklist to authenticated;

drop policy if exists kiosk_read on public.kiosk_devices;
create policy kiosk_read on public.kiosk_devices for select using (org_id = public.my_org_id() and public.is_org_admin());
grant select (id, org_id, location_id, name, pairing_expires_at, paired_at, last_seen_at, revoked_at, created_at) on public.kiosk_devices to authenticated;

-- ───────────────────────────────────────────── staff and admin functions
create or replace function public.vms_settings_for(p_org uuid)
returns public.visitor_settings language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare s public.visitor_settings;
begin
  select * into s from public.visitor_settings where org_id = p_org;
  if not found then
    insert into public.visitor_settings (org_id) values (p_org) on conflict (org_id) do nothing;
    select * into s from public.visitor_settings where org_id = p_org;
  end if;
  return s;
end $$;
revoke all on function public.vms_settings_for(uuid) from public, anon, authenticated;

-- Invite a visitor. Staff host their own visitors; admins and managers may name any active colleague as host.
-- Returns the visit id, its tablet code, and the pass token (shown once; only its hash is kept).
create or replace function public.vms_invite(p_location uuid, p_name text, p_email text, p_phone text, p_company text,
                                             p_purpose text, p_expected_at timestamptz, p_host uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  v_org uuid := public.my_org_id();
  v_me uuid := public.my_member_id();
  v_host uuid := coalesce(p_host, v_me);
  v_code text; v_token text; v_id uuid;
begin
  perform public.require_premium(v_org);
  perform public.rate_limit_hit('visitor_invite', 'u:' || auth.uid(), 60, interval '1 hour');
  perform public.rate_limit_hit('visitor_invite_org', 'o:' || v_org, 1000, interval '1 day');
  if v_host <> v_me and not public.is_org_viewer() then raise exception 'You can only invite visitors you are hosting yourself.'; end if;
  if not exists (select 1 from public.members where id = v_host and org_id = v_org and status = 'active') then
    raise exception 'Choose a host who is an active member of your company.';
  end if;
  if not exists (select 1 from public.locations where id = p_location and org_id = v_org) then raise exception 'Choose one of your offices.'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter the visitor’s name.'; end if;
  if p_email is not null and p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address for the visitor.'; end if;
  if p_expected_at is null or p_expected_at < now() - interval '1 day' or p_expected_at > now() + interval '180 days' then
    raise exception 'Choose a visit date from today up to six months ahead.';
  end if;
  loop
    v_code := public.random_code(8);
    exit when not exists (select 1 from public.visits where code = v_code);
  end loop;
  v_token := public.random_code(32);
  insert into public.visits (org_id, location_id, host_member_id, visitor_name, visitor_email, visitor_phone, visitor_company,
                             purpose, expected_at, code, pass_token_hash, created_by)
  values (v_org, p_location, v_host, trim(p_name), public.norm_email(p_email), nullif(trim(coalesce(p_phone, '')), ''),
          nullif(trim(coalesce(p_company, '')), ''), nullif(trim(coalesce(p_purpose, '')), ''), p_expected_at, v_code,
          public.token_hash(v_token), v_me)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'code', v_code, 'pass_token', v_token);
end $$;

create or replace function public.vms_cancel(p_visit uuid)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.require_premium(public.my_org_id());
  update public.visits set status = 'cancelled'
   where id = p_visit and org_id = public.my_org_id() and status = 'expected'
     and (public.is_org_viewer() or host_member_id = public.my_member_id() or created_by = public.my_member_id());
  if not found then raise exception 'That visit can’t be cancelled (it may have started already).'; end if;
end $$;

-- Front-desk sign-in/out from a staff computer (admins and managers), when not using the tablet.
create or replace function public.vms_staff_sign(p_visit uuid, p_in boolean)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare v public.visits; v_block public.visitor_blocklist;
begin
  perform public.require_premium(public.my_org_id());
  if not public.is_org_viewer() then raise exception 'Only admins and managers can sign visitors in or out here.'; end if;
  perform public.rate_limit_hit('visitor_sign', 'o:' || public.my_org_id(), 2000, interval '1 day');
  select * into v from public.visits where id = p_visit and org_id = public.my_org_id() for update;
  if not found then raise exception 'Visit not found.'; end if;
  if p_in then
    if v.status <> 'expected' then raise exception 'This visitor is not waiting to sign in.'; end if;
    select * into v_block from public.visitor_blocklist b where b.org_id = v.org_id and (
      (b.email is not null and public.norm_email(b.email) = public.norm_email(v.visitor_email)) or
      (b.phone is not null and public.norm_phone(b.phone) = public.norm_phone(v.visitor_phone)) or
      (b.name  is not null and public.norm_name(b.name)  = public.norm_name(v.visitor_name))) limit 1;
    if found then
      update public.visits set status = 'denied', denied_reason = coalesce(v_block.reason, 'On the visitor blocklist') where id = v.id;
      return jsonb_build_object('status', 'denied', 'reason', coalesce(v_block.reason, 'On the visitor blocklist'));
    end if;
    update public.visits set status = 'on_site', signed_in_at = now(), sign_in_source = 'staff' where id = v.id;
    return jsonb_build_object('status', 'on_site');
  else
    if v.status <> 'on_site' then raise exception 'This visitor is not signed in.'; end if;
    update public.visits set status = 'left', signed_out_at = now() where id = v.id;
    return jsonb_build_object('status', 'left');
  end if;
end $$;

create or replace function public.vms_save_settings(p_photo_required boolean, p_rules text, p_retention_days integer, p_notify_host boolean)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id();
begin
  perform public.require_premium(v_org);
  if not public.is_org_admin() then raise exception 'Only admins can change visitor settings.'; end if;
  insert into public.visitor_settings (org_id, photo_required, rules_text, retention_days, notify_host, updated_at)
  values (v_org, coalesce(p_photo_required, false), trim(p_rules), p_retention_days, coalesce(p_notify_host, true), now())
  on conflict (org_id) do update set photo_required = excluded.photo_required, rules_text = excluded.rules_text,
     retention_days = excluded.retention_days, notify_host = excluded.notify_host, updated_at = now();
end $$;

create or replace function public.vms_block(p_name text, p_email text, p_phone text, p_reason text)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.require_premium(public.my_org_id());
  if not public.is_org_admin() then raise exception 'Only admins can manage the visitor blocklist.'; end if;
  perform public.rate_limit_hit('visitor_block', 'o:' || public.my_org_id(), 200, interval '1 day');
  insert into public.visitor_blocklist (org_id, name, email, phone, reason, created_by)
  values (public.my_org_id(), nullif(trim(coalesce(p_name, '')), ''), public.norm_email(p_email),
          nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_reason, '')), ''), public.my_member_id());
end $$;

create or replace function public.vms_unblock(p_id uuid)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not public.is_org_admin() then raise exception 'Only admins can manage the visitor blocklist.'; end if;
  delete from public.visitor_blocklist where id = p_id and org_id = public.my_org_id();
end $$;

-- Reception tablets: create (or re-pair) returns a one-time pairing code valid for 15 minutes.
create or replace function public.vms_kiosk_pairing_code(p_location uuid, p_name text, p_device uuid default null)
returns text language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_code text := public.random_code(8);
begin
  perform public.require_premium(v_org);
  if not public.is_org_admin() then raise exception 'Only admins can set up reception tablets.'; end if;
  perform public.rate_limit_hit('kiosk_setup', 'o:' || v_org, 30, interval '1 day');
  if p_device is null then
    if not exists (select 1 from public.locations where id = p_location and org_id = v_org) then raise exception 'Choose one of your offices.'; end if;
    insert into public.kiosk_devices (org_id, location_id, name, pairing_code_hash, pairing_expires_at, created_by)
    values (v_org, p_location, coalesce(nullif(trim(p_name), ''), 'Reception tablet'), public.token_hash(v_code), now() + interval '15 minutes', public.my_member_id());
  else
    update public.kiosk_devices set pairing_code_hash = public.token_hash(v_code), pairing_expires_at = now() + interval '15 minutes',
           token_hash = null, revoked_at = null, paired_at = null
     where id = p_device and org_id = v_org;
    if not found then raise exception 'Tablet not found.'; end if;
  end if;
  return v_code;
end $$;

create or replace function public.vms_kiosk_revoke(p_device uuid)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not public.is_org_admin() then raise exception 'Only admins can manage reception tablets.'; end if;
  update public.kiosk_devices set revoked_at = now(), token_hash = null, pairing_code_hash = null
   where id = p_device and org_id = public.my_org_id();
end $$;

-- Who is on site at an office right now: staff checked in today and visitors signed in.
create or replace function public.vms_on_site(p_location uuid default null)
returns table (kind text, name text, detail text, since timestamptz, location_id uuid)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id();
begin
  if not public.is_org_viewer() then raise exception 'Only admins and managers can see who is on site.'; end if;
  return query
    select 'visitor'::text, v.visitor_name,
           concat_ws(' · ', v.visitor_company, 'host: ' || coalesce(m.full_name, m.email)), v.signed_in_at, v.location_id
      from public.visits v left join public.members m on m.id = v.host_member_id
     where v.org_id = v_org and v.status = 'on_site' and (p_location is null or v.location_id = p_location)
    union all
    select 'staff'::text, coalesce(m.full_name, m.email), m.team, l.at, l.location_id
      from public.member_latest_attendance l join public.members m on m.id = l.member_id
     where l.org_id = v_org and l.kind = 'in' and l.location_type = 'office'
       and l.at > now() - interval '18 hours' and (p_location is null or l.location_id = p_location)
    order by 1 desc, 4;
end $$;

-- ───────────────────────────────────────────── reception tablet (called only by the server)
-- The tablet holds a random token in a secure cookie; the server passes it here. These
-- functions are granted to service_role only.
create or replace function public.kiosk_device(p_token text)
returns public.kiosk_devices language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare d public.kiosk_devices;
begin
  select * into d from public.kiosk_devices where token_hash = public.token_hash(p_token) and revoked_at is null;
  if not found then raise exception using errcode = 'KF401', message = 'This tablet is not set up. Ask an admin for a pairing code.'; end if;
  perform public.require_premium(d.org_id);
  update public.kiosk_devices set last_seen_at = now() where id = d.id and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
  return d;
end $$;

create or replace function public.kiosk_pair(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare d public.kiosk_devices; v_token text := public.random_code(32) || public.random_code(16);
begin
  perform public.rate_limit_hit('kiosk_pair', 'global', 200, interval '1 hour');
  select * into d from public.kiosk_devices
   where pairing_code_hash = public.token_hash(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')))
     and pairing_expires_at > now() and revoked_at is null for update;
  if not found then raise exception 'That pairing code is wrong or has expired. Ask an admin for a new one.'; end if;
  update public.kiosk_devices set token_hash = public.token_hash(v_token), pairing_code_hash = null, pairing_expires_at = null, paired_at = now()
   where id = d.id;
  return jsonb_build_object('token', v_token, 'device', d.id);
end $$;

create or replace function public.kiosk_context(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare d public.kiosk_devices := public.kiosk_device(p_token); s public.visitor_settings := public.vms_settings_for(d.org_id);
begin
  return jsonb_build_object(
    'device', d.id, 'device_name', d.name, 'org_id', d.org_id,
    'org', (select jsonb_build_object('name', o.name, 'logo_url', o.logo_url, 'brand_color', o.brand_color, 'timezone', o.timezone) from public.organizations o where o.id = d.org_id),
    'location', (select jsonb_build_object('id', l.id, 'name', l.name) from public.locations l where l.id = d.location_id),
    'photo_required', s.photo_required, 'rules_text', s.rules_text);
end $$;

-- Find an invited visit by its code (expected for today at this office, or already on site).
create or replace function public.kiosk_find_visit(p_token text, p_code text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare d public.kiosk_devices := public.kiosk_device(p_token); v public.visits; v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  perform public.rate_limit_hit('kiosk_lookup', 'd:' || d.id, 600, interval '1 hour');
  select * into v from public.visits where code = v_code and org_id = d.org_id;
  if not found or v.status in ('cancelled') then raise exception 'We couldn’t find that invitation. Check the code, or sign in as a walk-in visitor.'; end if;
  if v.status = 'denied' then raise exception 'Please speak to reception.'; end if;
  if v.status = 'left' then raise exception 'This invitation has already been used.'; end if;
  if v.status = 'expected' and v.expected_at is not null and (v.expected_at < now() - interval '1 day' or v.expected_at > now() + interval '1 day') then
    raise exception 'This invitation is for another day.';
  end if;
  return jsonb_build_object('id', v.id, 'status', v.status, 'name', v.visitor_name, 'company', v.visitor_company,
    'host', (select coalesce(m.full_name, split_part(m.email, '@', 1)) from public.members m where m.id = v.host_member_id));
end $$;

-- Staff the tablet can offer as hosts for a walk-in visitor (search by name; names and teams only).
create or replace function public.kiosk_hosts(p_token text, p_query text)
returns table (id uuid, name text, team text) language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare d public.kiosk_devices := public.kiosk_device(p_token);
begin
  perform public.rate_limit_hit('kiosk_lookup', 'd:' || d.id, 600, interval '1 hour');
  if char_length(trim(coalesce(p_query, ''))) < 2 then return; end if;
  return query select m.id, coalesce(m.full_name, split_part(m.email, '@', 1)), m.team from public.members m
    where m.org_id = d.org_id and m.status = 'active' and coalesce(m.full_name, m.email) ilike '%' || trim(p_query) || '%'
    order by 2 limit 8;
end $$;

-- Sign a visitor in at the tablet: an invited visit (p_visit) or a walk-in (name + host).
-- Returns the outcome plus what the server needs to alert the host.
create or replace function public.kiosk_sign_in(p_token text, p_visit uuid, p_name text, p_phone text, p_email text, p_company text,
                                                p_purpose text, p_host uuid, p_rules_accepted boolean, p_photo_path text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  d public.kiosk_devices := public.kiosk_device(p_token);
  s public.visitor_settings := public.vms_settings_for(d.org_id);
  v public.visits; v_block public.visitor_blocklist; v_code text;
begin
  perform public.rate_limit_hit('kiosk_sign_in', 'd:' || d.id, 300, interval '1 hour');
  if not coalesce(p_rules_accepted, false) then raise exception 'Please read and accept the visitor rules.'; end if;
  if s.photo_required and p_photo_path is null then raise exception 'Please take a photo to finish signing in.'; end if;
  if p_photo_path is not null and p_photo_path !~ ('^' || d.org_id::text || '/[0-9a-f-]{36}\.jpg$') then raise exception 'Photo upload is invalid.'; end if;

  if p_visit is not null then
    select * into v from public.visits where id = p_visit and org_id = d.org_id for update;
    if not found or v.status <> 'expected' then raise exception 'This invitation can’t be used to sign in.'; end if;
  else
    if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter your full name.'; end if;
    if not exists (select 1 from public.members where id = p_host and org_id = d.org_id and status = 'active') then
      raise exception 'Choose who you are visiting.';
    end if;
    loop v_code := public.random_code(8); exit when not exists (select 1 from public.visits where code = v_code); end loop;
    insert into public.visits (org_id, location_id, host_member_id, visitor_name, visitor_email, visitor_phone, visitor_company, purpose,
                               expected_at, code, walk_in)
    values (d.org_id, d.location_id, p_host, trim(left(p_name, 120)), public.norm_email(left(p_email, 254)), nullif(trim(left(coalesce(p_phone, ''), 30)), ''),
            nullif(trim(left(coalesce(p_company, ''), 120)), ''), nullif(trim(left(coalesce(p_purpose, ''), 200)), ''), now(), v_code, true)
    returning * into v;
  end if;

  select * into v_block from public.visitor_blocklist b where b.org_id = d.org_id and (
    (b.email is not null and public.norm_email(b.email) = public.norm_email(v.visitor_email)) or
    (b.phone is not null and public.norm_phone(b.phone) = public.norm_phone(v.visitor_phone)) or
    (b.name  is not null and public.norm_name(b.name)  = public.norm_name(v.visitor_name))) limit 1;
  if found then
    update public.visits set status = 'denied', denied_reason = coalesce(v_block.reason, 'On the visitor blocklist'), location_id = d.location_id where id = v.id;
    return jsonb_build_object('status', 'denied', 'visit', v.id, 'visitor', v.visitor_name,
      'host_email', case when s.notify_host then (select m.email from public.members m where m.id = v.host_member_id) end,
      'host_name', (select coalesce(m.full_name, m.email) from public.members m where m.id = v.host_member_id));
  end if;

  update public.visits set status = 'on_site', signed_in_at = now(), sign_in_source = 'tablet', rules_accepted_at = now(),
         photo_path = coalesce(p_photo_path, photo_path), location_id = d.location_id
   where id = v.id returning * into v;
  return jsonb_build_object('status', 'on_site', 'visit', v.id, 'code', v.code, 'visitor', v.visitor_name, 'company', v.visitor_company,
    'signed_in_at', v.signed_in_at,
    'location', (select l.name from public.locations l where l.id = d.location_id),
    'host_name', (select coalesce(m.full_name, split_part(m.email, '@', 1)) from public.members m where m.id = v.host_member_id),
    'host_email', case when s.notify_host then (select m.email from public.members m where m.id = v.host_member_id) end);
end $$;

-- Sign out at the tablet: by the code on the badge/pass, or by picking from today's on-site list.
create or replace function public.kiosk_sign_out(p_token text, p_code text, p_visit uuid)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare d public.kiosk_devices := public.kiosk_device(p_token); v public.visits;
begin
  perform public.rate_limit_hit('kiosk_lookup', 'd:' || d.id, 600, interval '1 hour');
  select * into v from public.visits
   where org_id = d.org_id and status = 'on_site'
     and ((p_visit is not null and id = p_visit) or (p_code is not null and code = upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'))))
   for update;
  if not found then raise exception 'We couldn’t find you on today’s visitor list. Please see reception.'; end if;
  update public.visits set status = 'left', signed_out_at = now() where id = v.id;
  return jsonb_build_object('status', 'left', 'visitor', v.visitor_name);
end $$;

-- Visitors signed in at this tablet's office (first name + initial only — the tablet is in a public area).
create or replace function public.kiosk_visitors_on_site(p_token text)
returns table (id uuid, name text, since timestamptz) language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare d public.kiosk_devices := public.kiosk_device(p_token);
begin
  return query select v.id,
    split_part(v.visitor_name, ' ', 1) || coalesce(' ' || left(nullif(split_part(v.visitor_name, ' ', 2), ''), 1) || '.', ''),
    v.signed_in_at
    from public.visits v where v.org_id = d.org_id and v.location_id = d.location_id and v.status = 'on_site'
    order by v.signed_in_at desc limit 50;
end $$;

-- Visitor pass page (/v/<token>): what the visitor needs, nothing about anyone else.
create or replace function public.visit_pass(p_token text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare v public.visits;
begin
  select * into v from public.visits where pass_token_hash = public.token_hash(p_token);
  if not found or v.personal_data_deleted_at is not null then return null; end if;
  return jsonb_build_object('name', v.visitor_name, 'code', v.code, 'status', v.status, 'expected_at', v.expected_at,
    'signed_in_at', v.signed_in_at, 'purpose', v.purpose,
    'org', (select o.name from public.organizations o where o.id = v.org_id),
    'timezone', (select o.timezone from public.organizations o where o.id = v.org_id),
    'location', (select jsonb_build_object('name', l.name, 'address', l.address, 'lat', l.lat, 'lng', l.lng) from public.locations l where l.id = v.location_id),
    'host', (select coalesce(m.full_name, split_part(m.email, '@', 1)) from public.members m where m.id = v.host_member_id));
end $$;

-- Delete visitor details after the company's retention period. Returns photo paths for the
-- server to delete from storage. Called by the server (service_role) on a schedule of page loads.
create or replace function public.vms_purge_expired(p_limit integer default 200)
returns table (photo_path text) language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  return query
  with expired as (
    select v.id, v.photo_path as old_photo from public.visits v
      left join public.visitor_settings s on s.org_id = v.org_id
     where v.personal_data_deleted_at is null
       and coalesce(v.signed_out_at, v.signed_in_at, v.expected_at, v.created_at) < now() - make_interval(days => coalesce(s.retention_days, 90))
     limit greatest(1, least(p_limit, 1000))
  ), done as (
    update public.visits v set visitor_name = 'Deleted visitor', visitor_email = null, visitor_phone = null, visitor_company = null,
           purpose = null, pass_token_hash = null, photo_path = null, personal_data_deleted_at = now()
      from expired e where v.id = e.id
    returning e.old_photo
  )
  select d.old_photo from done d where d.old_photo is not null;
end $$;

-- Grants: staff/admin functions to signed-in users; tablet, pass and purge functions to the server only.
do $$
declare f text;
begin
  foreach f in array array[
    'vms_invite(uuid,text,text,text,text,text,timestamptz,uuid)', 'vms_cancel(uuid)', 'vms_staff_sign(uuid,boolean)',
    'vms_save_settings(boolean,text,integer,boolean)', 'vms_block(text,text,text,text)', 'vms_unblock(uuid)',
    'vms_kiosk_pairing_code(uuid,text,uuid)', 'vms_kiosk_revoke(uuid)', 'vms_on_site(uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array[
    'kiosk_device(text)', 'kiosk_pair(text)', 'kiosk_context(text)', 'kiosk_find_visit(text,text)', 'kiosk_hosts(text,text)',
    'kiosk_sign_in(text,uuid,text,text,text,text,text,uuid,boolean,text)', 'kiosk_sign_out(text,text,uuid)',
    'kiosk_visitors_on_site(text)', 'visit_pass(text)', 'vms_purge_expired(integer)', 'vms_settings_for(uuid)',
    'norm_phone(text)', 'norm_email(text)', 'norm_name(text)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- New limits shown on Global Admin → Security.
-- (Labels live in the app; nothing to add here.)

-- ───────────────────────────────────────────── recovery codes: find pgcrypto where Supabase keeps it
-- Supabase installs pgcrypto in the "extensions" schema; add it to these two functions' search path
-- so crypt()/gen_salt() resolve there (harmless where pgcrypto is in public).
alter function public.replace_recovery_codes(text[]) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.verify_and_consume_recovery_code(text) set search_path = pg_catalog, public, extensions, pg_temp;

commit;
