-- 5ime: visitor management, second version. Apply after 0015.
--
-- What changes for visitors:
--   * Invited visitors check in from the link in their invitation email (code filled in, editable).
--   * Walk-in visitors scan a QR poster at reception (one private link per office) and fill a form
--     on their own phone. No app, no account.
--   * Both then WAIT until reception admits them (a company setting; on by default). Invited visitors
--     can be let straight in instead if the company prefers.
-- What changes for the business:
--   * A reception desk: find a visitor by code, admit or turn away, sign out. Staff given
--     "reception desk" access can use it without being admins.
--   * An audit trail of every action on visitor data (who, what, when; no visitor names in it).
--   * Reports, a privacy notice, separate photo retention, and lookup/erase for a visitor's data request.
-- Backward compatible: the version of the app running before this release keeps working.
begin;

-- ───────────────────────────────────────────── visits: arrival, waiting, decisions
alter table public.visits drop constraint if exists visits_status_check;
alter table public.visits add constraint visits_status_check
  check (status in ('expected','waiting','on_site','left','cancelled','denied'));
alter table public.visits drop constraint if exists visits_sign_in_source_check;
alter table public.visits add constraint visits_sign_in_source_check
  check (sign_in_source is null or sign_in_source in ('tablet','staff','phone'));

alter table public.visits add column if not exists arrived_at timestamptz;
alter table public.visits add column if not exists arrival_source text
  check (arrival_source is null or arrival_source in ('link','qr','tablet','desk'));
alter table public.visits add column if not exists reason text
  check (reason is null or reason in ('meeting','delivery','interview','contractor','other'));
alter table public.visits add column if not exists host_hint text check (host_hint is null or char_length(host_hint) <= 120);
alter table public.visits add column if not exists decided_by uuid references public.members on delete set null;
alter table public.visits add column if not exists auto_signed_out boolean not null default false;
create index if not exists visits_org_status_idx on public.visits (org_id, status);
grant select (arrived_at, arrival_source, reason, host_hint, decided_by, auto_signed_out) on public.visits to authenticated;

-- ───────────────────────────────────────────── reception desk access for chosen staff
alter table public.members add column if not exists can_reception boolean not null default false;

create or replace function public.is_visitor_desk()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select coalesce((select m.status = 'active' and (m.role in ('owner','admin','manager') or m.can_reception)
                     from public.members m where m.user_id = auth.uid() limit 1), false)
$$;
revoke all on function public.is_visitor_desk() from public, anon;
grant execute on function public.is_visitor_desk() to authenticated;

drop policy if exists visits_read on public.visits;
create policy visits_read on public.visits for select using (
  org_id = public.my_org_id()
  and (public.is_visitor_desk() or host_member_id = public.my_member_id() or created_by = public.my_member_id()));

-- ───────────────────────────────────────────── settings
alter table public.visitor_settings add column if not exists require_admit boolean not null default true;
alter table public.visitor_settings add column if not exists auto_admit_invited boolean not null default false;
alter table public.visitor_settings add column if not exists office_hours_only boolean not null default true;
alter table public.visitor_settings add column if not exists photo_retention_days integer not null default 30
  check (photo_retention_days between 1 and 365);
alter table public.visitor_settings add column if not exists privacy_notice text not null default
  'We collect your name, phone number and the details of your visit to manage access to our building and keep everyone safe. Only our reception and the person you are visiting see them. We delete them automatically after the retention period. To see or delete your details, ask at reception.'
  check (char_length(privacy_notice) between 1 and 3000);

-- ───────────────────────────────────────────── one private visitor link per office (for the QR poster)
create table if not exists public.visitor_links (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations on delete cascade,
  location_id uuid not null references public.locations on delete cascade,
  token       text not null unique,
  created_by  uuid references public.members on delete set null,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create unique index if not exists visitor_links_one_live on public.visitor_links (location_id) where revoked_at is null;
alter table public.visitor_links enable row level security;
revoke all on public.visitor_links from public, anon, authenticated;
grant all on public.visitor_links to service_role;
drop policy if exists visitor_links_read on public.visitor_links;
create policy visitor_links_read on public.visitor_links for select using (org_id = public.my_org_id() and public.is_org_admin());
grant select on public.visitor_links to authenticated;

-- ───────────────────────────────────────────── audit trail
create table if not exists public.visitor_audit (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations on delete cascade,
  at         timestamptz not null default now(),
  actor      text not null check (actor in ('staff','visitor','tablet','system')),
  member_id  uuid references public.members on delete set null,
  action     text not null check (action in ('invited','cancelled','arrived','admitted','turned_away','signed_out','auto_signed_out',
                                             'blocked','unblocked','exported','settings_changed','link_changed','reception_access',
                                             'data_lookup','data_deleted','retention_purge')),
  visit_id   uuid references public.visits on delete set null,
  detail     text check (detail is null or char_length(detail) <= 300)
);
create index if not exists visitor_audit_org_idx on public.visitor_audit (org_id, at desc);
alter table public.visitor_audit enable row level security;
revoke all on public.visitor_audit from public, anon, authenticated;
grant all on public.visitor_audit to service_role;
drop policy if exists visitor_audit_read on public.visitor_audit;
create policy visitor_audit_read on public.visitor_audit for select using (org_id = public.my_org_id() and public.is_org_admin());
grant select on public.visitor_audit to authenticated;

-- Record an action. Never write visitor names or contact details into `detail`.
create or replace function public.vms_audit(p_org uuid, p_action text, p_visit uuid, p_detail text, p_actor text default null)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_member uuid := case when auth.uid() is not null then public.my_member_id() end;
begin
  insert into public.visitor_audit (org_id, actor, member_id, action, visit_id, detail)
  values (p_org, coalesce(p_actor, case when v_member is not null then 'staff' else 'system' end), v_member, p_action, p_visit, left(p_detail, 300));
end $$;
revoke all on function public.vms_audit(uuid,text,uuid,text,text) from public, anon, authenticated;

-- ───────────────────────────────────────────── shared helpers
create or replace function public.vms_blocked(p_org uuid, p_name text, p_email text, p_phone text)
returns public.visitor_blocklist language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select b.* from public.visitor_blocklist b where b.org_id = p_org and (
    (b.email is not null and public.norm_email(b.email) = public.norm_email(p_email)) or
    (b.phone is not null and public.norm_phone(b.phone) = public.norm_phone(p_phone)) or
    (b.name  is not null and public.norm_name(b.name)  = public.norm_name(p_name))) limit 1
$$;
revoke all on function public.vms_blocked(uuid,text,text,text) from public, anon, authenticated;

-- Is visitor sign-in open at this company now? (1 hour before work starts to 2 hours after it ends, company time)
create or replace function public.vms_open_now(p_org uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select case when not coalesce((select s.office_hours_only from public.visitor_settings s where s.org_id = p_org), true) then true
    else (select extract(epoch from (now() at time zone o.timezone)::time) / 60
                   between extract(epoch from o.work_start) / 60 - 60 and extract(epoch from o.work_end) / 60 + 120
            from public.organizations o where o.id = p_org) end
$$;
revoke all on function public.vms_open_now(uuid) from public, anon, authenticated;

-- What the server needs to tell a host their visitor is in.
create or replace function public.vms_admitted_json(p_visit uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select jsonb_build_object('status', v.status, 'visit', v.id, 'code', v.code, 'visitor', v.visitor_name, 'company', v.visitor_company,
    'signed_in_at', v.signed_in_at,
    'location', (select l.name from public.locations l where l.id = v.location_id),
    'host_name', (select coalesce(m.full_name, split_part(m.email, '@', 1)) from public.members m where m.id = v.host_member_id),
    'host_email', case when coalesce(s.notify_host, true) then (select m.email from public.members m where m.id = v.host_member_id) end)
  from public.visits v left join public.visitor_settings s on s.org_id = v.org_id where v.id = p_visit
$$;
revoke all on function public.vms_admitted_json(uuid) from public, anon, authenticated;

-- ───────────────────────────────────────────── invitations (now recorded in the audit trail)
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
  if v_host <> v_me and not public.is_visitor_desk() then raise exception 'You can only invite visitors you are hosting yourself.'; end if;
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
  perform public.vms_audit(v_org, 'invited', v_id, null);
  return jsonb_build_object('id', v_id, 'code', v_code, 'pass_token', v_token);
end $$;

create or replace function public.vms_cancel(p_visit uuid)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.require_premium(public.my_org_id());
  perform public.rate_limit_hit('visitor_sign', 'o:' || public.my_org_id(), 2000, interval '1 day');
  update public.visits set status = 'cancelled'
   where id = p_visit and org_id = public.my_org_id() and status = 'expected'
     and (public.is_visitor_desk() or host_member_id = public.my_member_id() or created_by = public.my_member_id());
  if not found then raise exception 'That visit can’t be cancelled (it may have started already).'; end if;
  perform public.vms_audit(public.my_org_id(), 'cancelled', p_visit, null);
end $$;

-- ───────────────────────────────────────────── reception desk
-- Find a visitor by the code on their invitation or waiting screen.
create or replace function public.vms_desk_find(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v public.visits; v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  perform public.rate_limit_hit('visitor_desk', 'o:' || v_org, 3000, interval '1 day');
  perform public.require_premium(v_org);
  if not public.is_visitor_desk() then raise exception 'Only reception, managers and admins can use the visitor desk.'; end if;
  select * into v from public.visits where code = v_code and org_id = v_org;
  if not found or v.personal_data_deleted_at is not null then raise exception 'No visitor has that code. Check it and try again.'; end if;
  return jsonb_build_object('id', v.id, 'status', v.status, 'name', v.visitor_name, 'company', v.visitor_company, 'phone', v.visitor_phone,
    'walk_in', v.walk_in, 'reason', v.reason, 'purpose', v.purpose, 'host_hint', v.host_hint, 'expected_at', v.expected_at,
    'arrived_at', v.arrived_at, 'signed_in_at', v.signed_in_at, 'code', v.code,
    'host', (select coalesce(m.full_name, split_part(m.email, '@', 1)) from public.members m where m.id = v.host_member_id),
    'location', (select l.name from public.locations l where l.id = v.location_id));
end $$;

-- Let a visitor in (invited and expected, or waiting at reception). Optionally set or change the host.
create or replace function public.vms_admit(p_visit uuid, p_host uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v public.visits; b public.visitor_blocklist;
begin
  perform public.rate_limit_hit('visitor_sign', 'o:' || v_org, 2000, interval '1 day');
  perform public.require_premium(v_org);
  if not public.is_visitor_desk() then raise exception 'Only reception, managers and admins can admit visitors.'; end if;
  select * into v from public.visits where id = p_visit and org_id = v_org for update;
  if not found then raise exception 'Visit not found.'; end if;
  if v.status not in ('expected','waiting') then raise exception 'This visitor is not waiting to come in.'; end if;
  if p_host is not null and not exists (select 1 from public.members where id = p_host and org_id = v_org and status = 'active') then
    raise exception 'Choose a host who is an active member of your company.';
  end if;
  b := public.vms_blocked(v_org, v.visitor_name, v.visitor_email, v.visitor_phone);
  if b.id is not null then
    update public.visits set status = 'denied', denied_reason = coalesce(b.reason, 'On the visitor blocklist'), decided_by = public.my_member_id() where id = v.id;
    perform public.vms_audit(v_org, 'turned_away', v.id, 'On the blocklist');
    return jsonb_build_object('status', 'denied', 'visit', v.id, 'reason', coalesce(b.reason, 'On the visitor blocklist'));
  end if;
  update public.visits set status = 'on_site', signed_in_at = now(), sign_in_source = 'staff', decided_by = public.my_member_id(),
         arrived_at = coalesce(arrived_at, now()), arrival_source = coalesce(arrival_source, 'desk'),
         host_member_id = coalesce(p_host, host_member_id)
   where id = v.id;
  perform public.vms_audit(v_org, 'admitted', v.id, null);
  return public.vms_admitted_json(v.id);
end $$;

create or replace function public.vms_turn_away(p_visit uuid, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id();
begin
  perform public.rate_limit_hit('visitor_sign', 'o:' || v_org, 2000, interval '1 day');
  if not public.is_visitor_desk() then raise exception 'Only reception, managers and admins can turn visitors away.'; end if;
  update public.visits set status = 'denied', denied_reason = coalesce(nullif(trim(left(coalesce(p_reason, ''), 200)), ''), 'Turned away by reception'),
         decided_by = public.my_member_id()
   where id = p_visit and org_id = v_org and status in ('expected','waiting');
  if not found then raise exception 'This visitor is not waiting to come in.'; end if;
  perform public.vms_audit(v_org, 'turned_away', p_visit, 'By reception');
end $$;

-- The existing front-desk sign in/out, now open to reception staff and recorded.
create or replace function public.vms_staff_sign(p_visit uuid, p_in boolean)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id();
begin
  perform public.rate_limit_hit('visitor_sign', 'o:' || v_org, 2000, interval '1 day');
  perform public.require_premium(v_org);
  if not public.is_visitor_desk() then raise exception 'Only reception, managers and admins can sign visitors in or out here.'; end if;
  if p_in then return public.vms_admit(p_visit, null); end if;
  update public.visits set status = 'left', signed_out_at = now() where id = p_visit and org_id = v_org and status = 'on_site';
  if not found then raise exception 'This visitor is not signed in.'; end if;
  perform public.vms_audit(v_org, 'signed_out', p_visit, 'By reception');
  return jsonb_build_object('status', 'left');
end $$;

create or replace function public.vms_on_site(p_location uuid default null)
returns table (kind text, name text, detail text, since timestamptz, location_id uuid)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id();
begin
  if not public.is_visitor_desk() then raise exception 'Only reception, managers and admins can see who is on site.'; end if;
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

-- Names of active colleagues, for the desk's host picker and lists (reception staff cannot read the
-- staff table itself). Names and teams only.
create or replace function public.vms_hosts()
returns table (id uuid, name text, team text) language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not public.is_visitor_desk() then raise exception 'Only reception, managers and admins can see the host list.'; end if;
  return query select m.id, coalesce(m.full_name, split_part(m.email, '@', 1)), m.team
    from public.members m where m.org_id = public.my_org_id() and m.status = 'active' order by 2;
end $$;

-- Give or remove reception-desk access for a staff member.
create or replace function public.vms_set_reception(p_member uuid, p_on boolean)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id();
begin
  perform public.rate_limit_hit('visitor_admin', 'o:' || v_org, 300, interval '1 day');
  if not public.is_org_admin() then raise exception 'Only admins can give reception desk access.'; end if;
  update public.members set can_reception = coalesce(p_on, false) where id = p_member and org_id = v_org;
  if not found then raise exception 'Person not found.'; end if;
  perform public.vms_audit(v_org, 'reception_access', null, case when p_on then 'Given' else 'Removed' end);
end $$;

-- ───────────────────────────────────────────── admin: link, settings, blocklist, exports
-- The office's visitor link token (creates one the first time).
create or replace function public.vms_visitor_link(p_location uuid)
returns text language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_token text;
begin
  perform public.rate_limit_hit('visitor_admin', 'o:' || v_org, 300, interval '1 day');
  perform public.require_premium(v_org);
  if not public.is_org_admin() then raise exception 'Only admins can manage the visitor link.'; end if;
  if not exists (select 1 from public.locations where id = p_location and org_id = v_org) then raise exception 'Choose one of your offices.'; end if;
  select token into v_token from public.visitor_links where location_id = p_location and revoked_at is null;
  if v_token is null then
    v_token := public.random_code(10);
    insert into public.visitor_links (org_id, location_id, token, created_by) values (v_org, p_location, v_token, public.my_member_id());
    perform public.vms_audit(v_org, 'link_changed', null, 'Created');
  end if;
  return v_token;
end $$;

-- Replace the office's link (the old poster stops working).
create or replace function public.vms_rotate_visitor_link(p_location uuid)
returns text language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id();
begin
  perform public.rate_limit_hit('visitor_admin', 'o:' || v_org, 300, interval '1 day');
  if not public.is_org_admin() then raise exception 'Only admins can manage the visitor link.'; end if;
  update public.visitor_links set revoked_at = now() where location_id = p_location and org_id = v_org and revoked_at is null;
  perform public.vms_audit(v_org, 'link_changed', null, 'Replaced; the old poster no longer works');
  return public.vms_visitor_link(p_location);
end $$;

create or replace function public.vms_update_settings(p_photo_required boolean, p_rules text, p_retention_days integer, p_notify_host boolean,
                                                      p_require_admit boolean, p_auto_admit_invited boolean, p_office_hours_only boolean,
                                                      p_privacy_notice text, p_photo_retention_days integer)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id();
begin
  perform public.rate_limit_hit('visitor_admin', 'o:' || v_org, 300, interval '1 day');
  perform public.require_premium(v_org);
  if not public.is_org_admin() then raise exception 'Only admins can change visitor settings.'; end if;
  if p_photo_retention_days > p_retention_days then raise exception 'Photos can’t be kept longer than the visitor’s other details.'; end if;
  insert into public.visitor_settings (org_id, photo_required, rules_text, retention_days, notify_host, require_admit, auto_admit_invited,
                                       office_hours_only, privacy_notice, photo_retention_days, updated_at)
  values (v_org, coalesce(p_photo_required, false), trim(p_rules), p_retention_days, coalesce(p_notify_host, true), coalesce(p_require_admit, true),
          coalesce(p_auto_admit_invited, false), coalesce(p_office_hours_only, true), trim(p_privacy_notice), p_photo_retention_days, now())
  on conflict (org_id) do update set photo_required = excluded.photo_required, rules_text = excluded.rules_text,
     retention_days = excluded.retention_days, notify_host = excluded.notify_host, require_admit = excluded.require_admit,
     auto_admit_invited = excluded.auto_admit_invited, office_hours_only = excluded.office_hours_only,
     privacy_notice = excluded.privacy_notice, photo_retention_days = excluded.photo_retention_days, updated_at = now();
  perform public.vms_audit(v_org, 'settings_changed', null, null);
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
  perform public.vms_audit(public.my_org_id(), 'blocked', null, null);
end $$;

create or replace function public.vms_unblock(p_id uuid)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not public.is_org_admin() then raise exception 'Only admins can manage the visitor blocklist.'; end if;
  delete from public.visitor_blocklist where id = p_id and org_id = public.my_org_id();
  if found then perform public.vms_audit(public.my_org_id(), 'unblocked', null, null); end if;
end $$;

-- Called by the visitor-log CSV download, so exports appear in the audit trail.
create or replace function public.vms_log_export(p_from date, p_to date)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.rate_limit_hit('report_export', 'u:' || auth.uid(), 30, interval '1 hour');
  if not public.is_org_viewer() then raise exception 'Only managers and admins can export the visitor log.'; end if;
  perform public.vms_audit(public.my_org_id(), 'exported', null, format('Visitor log %s to %s', p_from, p_to));
end $$;

-- ───────────────────────────────────────────── reports
create or replace function public.vms_report(p_from date, p_to date, p_location uuid default null)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  v_org uuid := public.my_org_id();
  v_tz text := (select timezone from public.organizations where id = v_org);
  v_start timestamptz; v_end timestamptz; v_days integer;
begin
  if not public.is_org_viewer() then raise exception 'Only managers and admins can see visitor reports.'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'Choose a period of up to one year.'; end if;
  v_start := (p_from::timestamp) at time zone v_tz;
  v_end := ((p_to + 1)::timestamp) at time zone v_tz;
  v_days := p_to - p_from + 1;
  return (
    with v as (
      select x.*, coalesce(x.signed_in_at, x.arrived_at, x.expected_at, x.created_at) as t
        from public.visits x
       where x.org_id = v_org and (p_location is null or x.location_id = p_location)
    ), period as (select * from v where t >= v_start and t < v_end),
    came as (select * from period where status in ('on_site','left'))
    select jsonb_build_object(
      'total', (select count(*) from came),
      'previous_total', (select count(*) from v where status in ('on_site','left') and t >= v_start - make_interval(days => v_days) and t < v_start),
      'walk_ins', (select count(*) from came where walk_in),
      'invited', (select count(*) from came where not walk_in),
      'avg_minutes', (select round(avg(extract(epoch from signed_out_at - signed_in_at) / 60)) from came where status = 'left' and not auto_signed_out and signed_out_at is not null),
      'longest_minutes', (select round(max(extract(epoch from signed_out_at - signed_in_at) / 60)) from came where status = 'left' and not auto_signed_out and signed_out_at is not null),
      'turned_away', (select count(*) from period where status = 'denied'),
      'auto_signed_out', (select count(*) from came where auto_signed_out),
      'no_shows', (select count(*) from period where status = 'expected' and expected_at < now() - interval '1 day'),
      'by_weekday', (select coalesce(jsonb_agg(c order by d), '[]'::jsonb) from (
          select d, (select count(*) from came where extract(isodow from t at time zone v_tz) = d) c from generate_series(1, 7) d) w),
      'by_reason', (select coalesce(jsonb_agg(jsonb_build_object('reason', r, 'count', c) order by c desc), '[]'::jsonb) from (
          select coalesce(reason, case when walk_in then 'other' else 'invited' end) r, count(*) c from came group by 1) x),
      'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', dt, 'count', c) order by dt), '[]'::jsonb) from (
          select (t at time zone v_tz)::date dt, count(*) c from came group by 1) x),
      'top_hosts', (select coalesce(jsonb_agg(jsonb_build_object('name', n, 'count', c) order by c desc), '[]'::jsonb) from (
          select coalesce(m.full_name, split_part(m.email, '@', 1)) n, count(*) c from came join public.members m on m.id = came.host_member_id
           group by 1 order by 2 desc limit 5) x))
  );
end $$;

-- ───────────────────────────────────────────── a visitor's request to see or erase their data
create or replace function public.vms_find_visitor(p_query text)
returns table (id uuid, name text, email text, phone text, company text, status text, at timestamptz)
language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_email text := public.norm_email(p_query); v_phone text := public.norm_phone(p_query);
begin
  perform public.rate_limit_hit('visitor_admin', 'o:' || v_org, 300, interval '1 day');
  if not public.is_org_admin() then raise exception 'Only admins can look up a visitor’s data.'; end if;
  if not (coalesce(p_query, '') like '%@%' or char_length(coalesce(v_phone, '')) >= 7) then
    raise exception 'Enter the visitor’s full email address or phone number.';
  end if;
  perform public.vms_audit(v_org, 'data_lookup', null, null);
  return query select x.id, x.visitor_name, x.visitor_email, x.visitor_phone, x.visitor_company, x.status,
                      coalesce(x.signed_in_at, x.arrived_at, x.expected_at, x.created_at)
    from public.visits x
   where x.org_id = v_org and x.personal_data_deleted_at is null
     and ((p_query like '%@%' and public.norm_email(x.visitor_email) = v_email)
       or (p_query not like '%@%' and public.norm_phone(x.visitor_phone) = v_phone))
   order by 7 desc limit 200;
end $$;

-- Erase every visit matching an email or phone. Returns photo paths for the server to delete.
create or replace function public.vms_forget_visitor(p_query text)
returns table (photo_path text) language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_email text := public.norm_email(p_query); v_phone text := public.norm_phone(p_query); v_count integer;
begin
  perform public.rate_limit_hit('visitor_admin', 'o:' || v_org, 300, interval '1 day');
  if not public.is_org_admin() then raise exception 'Only admins can erase a visitor’s data.'; end if;
  if not (coalesce(p_query, '') like '%@%' or char_length(coalesce(v_phone, '')) >= 7) then
    raise exception 'Enter the visitor’s full email address or phone number.';
  end if;
  create temporary table if not exists pg_temp.vms_forgotten (photo text) on commit drop;
  delete from pg_temp.vms_forgotten;
  with gone as (
    select x.id, x.photo_path as old_photo from public.visits x
     where x.org_id = v_org and x.personal_data_deleted_at is null and x.status <> 'on_site'
       and ((p_query like '%@%' and public.norm_email(x.visitor_email) = v_email)
         or (p_query not like '%@%' and public.norm_phone(x.visitor_phone) = v_phone))
  ), done as (
    update public.visits x set visitor_name = 'Deleted visitor', visitor_email = null, visitor_phone = null, visitor_company = null,
           purpose = null, host_hint = null, pass_token_hash = null, photo_path = null, personal_data_deleted_at = now()
      from gone g where x.id = g.id returning g.old_photo
  )
  insert into pg_temp.vms_forgotten select old_photo from done;
  get diagnostics v_count = row_count;
  perform public.vms_audit(v_org, 'data_deleted', null, format('%s visit(s) erased on request', v_count));
  return query select f.photo from pg_temp.vms_forgotten f where f.photo is not null;
end $$;

-- ───────────────────────────────────────────── visitors on their own phone (called only by the server)
-- The office behind a visitor link, for the walk-in form.
create or replace function public.walkin_context(p_link text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare k public.visitor_links; s public.visitor_settings;
begin
  select * into k from public.visitor_links where token = upper(coalesce(p_link, '')) and revoked_at is null;
  if not found or not public.org_has_premium(k.org_id) then return null; end if;
  select * into s from public.visitor_settings where org_id = k.org_id;
  return jsonb_build_object(
    'org', (select jsonb_build_object('name', o.name, 'logo_url', o.logo_url, 'timezone', o.timezone) from public.organizations o where o.id = k.org_id),
    'location', (select l.name from public.locations l where l.id = k.location_id),
    'open', public.vms_open_now(k.org_id),
    'rules_text', coalesce(s.rules_text, 'By signing in you agree to follow our safety rules, wear your visitor badge, and stay with your host.'),
    'privacy_notice', coalesce(s.privacy_notice, ''),
    'retention_days', coalesce(s.retention_days, 90));
end $$;

-- A walk-in visitor sends their details from their phone. Returns their private status link token.
create or replace function public.walkin_submit(p_link text, p_client text, p_name text, p_phone text, p_email text, p_company text,
                                                p_reason text, p_purpose text, p_host_hint text, p_rules_accepted boolean)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare k public.visitor_links; s public.visitor_settings; v public.visits; b public.visitor_blocklist; v_code text; v_token text; v_admit boolean;
begin
  perform public.rate_limit_hit('walkin_client', 'c:' || coalesce(nullif(p_client, ''), 'unknown'), 10, interval '1 hour');
  select * into k from public.visitor_links where token = upper(coalesce(p_link, '')) and revoked_at is null;
  if not found then raise exception 'This visitor link no longer works. Please speak to reception.'; end if;
  perform public.rate_limit_hit('walkin_link', 'l:' || k.id, 300, interval '1 hour');
  perform public.require_premium(k.org_id);
  s := public.vms_settings_for(k.org_id);
  if not public.vms_open_now(k.org_id) then raise exception 'Visitor sign-in is closed right now. Please speak to reception.'; end if;
  if not coalesce(p_rules_accepted, false) then raise exception 'Please accept the visitor rules and privacy notice.'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter your full name.'; end if;
  if char_length(coalesce(public.norm_phone(p_phone), '')) < 7 then raise exception 'Enter your phone number.'; end if;
  if p_email is not null and p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address, or leave it empty.'; end if;
  if p_reason is null or p_reason not in ('meeting','delivery','interview','contractor','other') then raise exception 'Choose the reason for your visit.'; end if;
  loop v_code := public.random_code(8); exit when not exists (select 1 from public.visits where code = v_code); end loop;
  v_token := public.random_code(32);
  v_admit := not s.require_admit;
  insert into public.visits (org_id, location_id, visitor_name, visitor_email, visitor_phone, visitor_company, reason, purpose, host_hint,
                             expected_at, code, pass_token_hash, walk_in, status, arrived_at, arrival_source, rules_accepted_at)
  values (k.org_id, k.location_id, trim(left(p_name, 120)), public.norm_email(left(p_email, 254)), trim(left(p_phone, 30)),
          nullif(trim(left(coalesce(p_company, ''), 120)), ''), p_reason, nullif(trim(left(coalesce(p_purpose, ''), 200)), ''),
          nullif(trim(left(coalesce(p_host_hint, ''), 120)), ''), now(), v_code, public.token_hash(v_token), true, 'waiting', now(), 'qr', now())
  returning * into v;
  b := public.vms_blocked(k.org_id, v.visitor_name, v.visitor_email, v.visitor_phone);
  if b.id is not null then
    update public.visits set status = 'denied', denied_reason = coalesce(b.reason, 'On the visitor blocklist') where id = v.id;
    perform public.vms_audit(k.org_id, 'turned_away', v.id, 'On the blocklist', 'visitor');
  elsif v_admit then
    update public.visits set status = 'on_site', signed_in_at = now(), sign_in_source = 'phone' where id = v.id;
    perform public.vms_audit(k.org_id, 'admitted', v.id, 'Walk-in (reception approval off)', 'visitor');
  else
    perform public.vms_audit(k.org_id, 'arrived', v.id, 'Walk-in, from the QR poster', 'visitor');
  end if;
  return jsonb_build_object('pass_token', v_token, 'status', (select status from public.visits where id = v.id));
end $$;

-- An invited visitor checks in from their pass link. The code is filled in from the link but can be typed.
create or replace function public.visit_checkin(p_token text, p_code text, p_phone text, p_company text, p_rules_accepted boolean)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare v public.visits; s public.visitor_settings; b public.visitor_blocklist;
begin
  select * into v from public.visits where pass_token_hash = public.token_hash(coalesce(p_token, '')) for update;
  if not found or v.personal_data_deleted_at is not null then raise exception 'This visitor pass is not valid.'; end if;
  perform public.rate_limit_hit('visit_checkin', 'v:' || v.id, 20, interval '1 hour');
  perform public.require_premium(v.org_id);
  if v.status in ('waiting','on_site') then return jsonb_build_object('status', v.status, 'visit', v.id); end if;
  if v.status = 'denied' then raise exception 'Please speak to reception.'; end if;
  if v.status <> 'expected' then raise exception 'This invitation can no longer be used.'; end if;
  if upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) <> v.code then raise exception 'That code doesn’t match your invitation. Check your email.'; end if;
  if v.expected_at is not null and (v.expected_at < now() - interval '1 day' or v.expected_at > now() + interval '1 day') then
    raise exception 'Your invitation is for another day. Please speak to reception.';
  end if;
  if not coalesce(p_rules_accepted, false) then raise exception 'Please accept the visitor rules and privacy notice.'; end if;
  s := public.vms_settings_for(v.org_id);
  update public.visits set visitor_phone = coalesce(nullif(trim(left(coalesce(p_phone, ''), 30)), ''), visitor_phone),
         visitor_company = coalesce(nullif(trim(left(coalesce(p_company, ''), 120)), ''), visitor_company),
         arrived_at = now(), arrival_source = 'link', rules_accepted_at = now(), status = 'waiting'
   where id = v.id returning * into v;
  b := public.vms_blocked(v.org_id, v.visitor_name, v.visitor_email, v.visitor_phone);
  if b.id is not null then
    update public.visits set status = 'denied', denied_reason = coalesce(b.reason, 'On the visitor blocklist') where id = v.id;
    perform public.vms_audit(v.org_id, 'turned_away', v.id, 'On the blocklist', 'visitor');
    return jsonb_build_object('status', 'denied', 'visit', v.id);
  end if;
  if not s.require_admit or s.auto_admit_invited then
    update public.visits set status = 'on_site', signed_in_at = now(), sign_in_source = 'phone' where id = v.id;
    perform public.vms_audit(v.org_id, 'admitted', v.id, 'Invited (let in automatically)', 'visitor');
    return public.vms_admitted_json(v.id);
  end if;
  perform public.vms_audit(v.org_id, 'arrived', v.id, 'Invited, from the email link', 'visitor');
  return jsonb_build_object('status', 'waiting', 'visit', v.id);
end $$;

-- A visitor signs themselves out from their phone.
create or replace function public.visit_sign_out(p_token text)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare v public.visits;
begin
  select * into v from public.visits where pass_token_hash = public.token_hash(coalesce(p_token, '')) for update;
  if not found then raise exception 'This visitor pass is not valid.'; end if;
  perform public.rate_limit_hit('visit_checkin', 'v:' || v.id, 20, interval '1 hour');
  if v.status <> 'on_site' then raise exception 'You are not signed in.'; end if;
  update public.visits set status = 'left', signed_out_at = now() where id = v.id;
  perform public.vms_audit(v.org_id, 'signed_out', v.id, 'From their phone', 'visitor');
end $$;

-- The pass/status page: what this visitor needs, nothing about anyone else.
create or replace function public.visit_pass(p_token text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare v public.visits; s public.visitor_settings;
begin
  select * into v from public.visits where pass_token_hash = public.token_hash(p_token);
  if not found or v.personal_data_deleted_at is not null then return null; end if;
  select * into s from public.visitor_settings where org_id = v.org_id;
  return jsonb_build_object('name', v.visitor_name, 'code', v.code, 'status', v.status, 'expected_at', v.expected_at,
    'signed_in_at', v.signed_in_at, 'arrived_at', v.arrived_at, 'purpose', v.purpose, 'walk_in', v.walk_in,
    'phone', v.visitor_phone, 'company', v.visitor_company, 'reason', v.reason, 'host_hint', v.host_hint,
    'org', (select o.name from public.organizations o where o.id = v.org_id),
    'timezone', (select o.timezone from public.organizations o where o.id = v.org_id),
    'location', (select jsonb_build_object('name', l.name, 'address', l.address, 'lat', l.lat, 'lng', l.lng) from public.locations l where l.id = v.location_id),
    'host', (select coalesce(m.full_name, split_part(m.email, '@', 1)) from public.members m where m.id = v.host_member_id),
    'rules_text', coalesce(s.rules_text, 'By signing in you agree to follow our safety rules, wear your visitor badge, and stay with your host.'),
    'privacy_notice', coalesce(s.privacy_notice, ''),
    'retention_days', coalesce(s.retention_days, 90));
end $$;

-- ───────────────────────────────────────────── reception tablet: waits for reception too (when the company says so)
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

  v_block := public.vms_blocked(d.org_id, v.visitor_name, v.visitor_email, v.visitor_phone);
  if v_block.id is not null then
    update public.visits set status = 'denied', denied_reason = coalesce(v_block.reason, 'On the visitor blocklist'), location_id = d.location_id where id = v.id;
    perform public.vms_audit(d.org_id, 'turned_away', v.id, 'On the blocklist (tablet)', 'tablet');
    return jsonb_build_object('status', 'denied', 'visit', v.id, 'visitor', v.visitor_name,
      'host_email', case when s.notify_host then (select m.email from public.members m where m.id = v.host_member_id) end,
      'host_name', (select coalesce(m.full_name, m.email) from public.members m where m.id = v.host_member_id));
  end if;

  if s.require_admit and not (p_visit is not null and s.auto_admit_invited) then
    update public.visits set status = 'waiting', arrived_at = now(), arrival_source = 'tablet', rules_accepted_at = now(),
           photo_path = coalesce(p_photo_path, photo_path), location_id = d.location_id
     where id = v.id returning * into v;
    perform public.vms_audit(d.org_id, 'arrived', v.id, 'At the reception tablet', 'tablet');
    return jsonb_build_object('status', 'waiting', 'visit', v.id, 'code', v.code, 'visitor', v.visitor_name, 'company', v.visitor_company,
      'location', (select l.name from public.locations l where l.id = d.location_id));
  end if;

  update public.visits set status = 'on_site', signed_in_at = now(), sign_in_source = 'tablet', rules_accepted_at = now(),
         arrived_at = coalesce(arrived_at, now()), arrival_source = coalesce(arrival_source, 'tablet'),
         photo_path = coalesce(p_photo_path, photo_path), location_id = d.location_id
   where id = v.id returning * into v;
  perform public.vms_audit(d.org_id, 'admitted', v.id, 'At the reception tablet', 'tablet');
  return jsonb_build_object('status', 'on_site', 'visit', v.id, 'code', v.code, 'visitor', v.visitor_name, 'company', v.visitor_company,
    'signed_in_at', v.signed_in_at,
    'location', (select l.name from public.locations l where l.id = d.location_id),
    'host_name', (select coalesce(m.full_name, split_part(m.email, '@', 1)) from public.members m where m.id = v.host_member_id),
    'host_email', case when s.notify_host then (select m.email from public.members m where m.id = v.host_member_id) end);
end $$;

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
  perform public.vms_audit(d.org_id, 'signed_out', v.id, 'At the reception tablet', 'tablet');
  return jsonb_build_object('status', 'left', 'visitor', v.visitor_name);
end $$;

-- ───────────────────────────────────────────── housekeeping (run by the server every few minutes)
-- 1. delete visitor details past retention; 2. delete photos past photo retention; 3. close visits
-- nobody signed out (16 hours) and requests nobody answered (12 hours); 4. drop audit entries older than 2 years.
create or replace function public.vms_purge_expired(p_limit integer default 200)
returns table (photo_path text) language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare r record;
begin
  create temporary table if not exists pg_temp.vms_purged (org_id uuid, photo text) on commit drop;
  delete from pg_temp.vms_purged;
  with expired as (
    select v.id, v.org_id, v.photo_path as old_photo from public.visits v
      left join public.visitor_settings s on s.org_id = v.org_id
     where v.personal_data_deleted_at is null and v.status not in ('on_site','waiting')
       and coalesce(v.signed_out_at, v.signed_in_at, v.arrived_at, v.expected_at, v.created_at) < now() - make_interval(days => coalesce(s.retention_days, 90))
     limit greatest(1, least(p_limit, 1000))
  ), done as (
    update public.visits v set visitor_name = 'Deleted visitor', visitor_email = null, visitor_phone = null, visitor_company = null,
           purpose = null, host_hint = null, pass_token_hash = null, photo_path = null, personal_data_deleted_at = now()
      from expired e where v.id = e.id
    returning e.org_id, e.old_photo
  )
  insert into pg_temp.vms_purged select org_id, old_photo from done;

  with old_photos as (
    select v.id, v.org_id, v.photo_path as old_photo from public.visits v
      left join public.visitor_settings s on s.org_id = v.org_id
     where v.photo_path is not null and v.status <> 'on_site'
       and coalesce(v.signed_out_at, v.signed_in_at, v.created_at) < now() - make_interval(days => coalesce(s.photo_retention_days, 30))
     limit greatest(1, least(p_limit, 1000))
  ), done as (
    update public.visits v set photo_path = null from old_photos o where v.id = o.id returning o.org_id, o.old_photo
  )
  insert into pg_temp.vms_purged select org_id, old_photo from done;

  for r in select org_id, count(*) n from pg_temp.vms_purged group by org_id loop
    perform public.vms_audit(r.org_id, 'retention_purge', null, format('%s record(s) or photo(s) deleted after the retention period', r.n), 'system');
  end loop;

  for r in update public.visits set status = 'left', signed_out_at = now(), auto_signed_out = true
            where status = 'on_site' and signed_in_at < now() - interval '16 hours' returning id, org_id loop
    perform public.vms_audit(r.org_id, 'auto_signed_out', r.id, 'Not signed out within 16 hours', 'system');
  end loop;
  update public.visits set status = 'cancelled', denied_reason = 'Not admitted by reception'
   where status = 'waiting' and arrived_at < now() - interval '12 hours';
  delete from public.visitor_audit where at < now() - interval '2 years';

  return query select p.photo from pg_temp.vms_purged p where p.photo is not null;
  truncate pg_temp.vms_purged;
end $$;

-- ───────────────────────────────────────────── Premium plan description (only if Global Admin hasn't edited it)
update public.platform_plans set features = array['Everything in Pro',
         'Visitors check in from their own phone (invitation link or QR poster)',
         'Reception desk: admit or turn away each visitor',
         'Reception access for front-desk staff, without admin rights',
         'Host alert the moment a visitor is let in',
         'Who’s on site: staff and visitors, for fire drills',
         'Visitor reports, audit trail and blocklist',
         'Privacy notice, automatic deletion and data requests (NDPA)',
         'Optional reception tablet with badge printing']
 where plan = 'premium' and features[2] = 'Visitor invitations with a QR pass by email';

-- ───────────────────────────────────────────── grants
do $$
declare f text;
begin
  foreach f in array array[
    'vms_desk_find(text)', 'vms_hosts()', 'vms_admit(uuid,uuid)', 'vms_turn_away(uuid,text)', 'vms_set_reception(uuid,boolean)',
    'vms_visitor_link(uuid)', 'vms_rotate_visitor_link(uuid)',
    'vms_update_settings(boolean,text,integer,boolean,boolean,boolean,boolean,text,integer)',
    'vms_log_export(date,date)', 'vms_report(date,date,uuid)', 'vms_find_visitor(text)', 'vms_forget_visitor(text)',
    'vms_invite(uuid,text,text,text,text,text,timestamptz,uuid)', 'vms_cancel(uuid)', 'vms_staff_sign(uuid,boolean)',
    'vms_block(text,text,text,text)', 'vms_unblock(uuid)', 'vms_on_site(uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array[
    'walkin_context(text)', 'walkin_submit(text,text,text,text,text,text,text,text,text,boolean)',
    'visit_checkin(text,text,text,text,boolean)', 'visit_sign_out(text)', 'visit_pass(text)',
    'kiosk_sign_in(text,uuid,text,text,text,text,text,uuid,boolean,text)', 'kiosk_sign_out(text,text,uuid)',
    'vms_purge_expired(integer)', 'vms_blocked(uuid,text,text,text)', 'vms_open_now(uuid)', 'vms_admitted_json(uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

commit;
