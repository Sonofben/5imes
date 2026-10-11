-- 5ime: company branding + company links, staff onboarding, Kora Forge console,
-- client-controlled support access, company suspension and complimentary terms.
-- Apply after 0005.
begin;

-- ───────────────────────────────────────────── branding & company link (5ime.ng/<slug>)
alter table public.organizations
  add column slug text,
  add column logo_url text,
  add column brand_color text,
  add column suspended_at timestamptz;

create or replace function public.unique_org_slug(p_name text)
returns text language plpgsql set search_path = pg_catalog, public, pg_temp as $$
declare v_base text; v_slug text; n int := 1;
begin
  v_base := trim(both '-' from regexp_replace(lower(coalesce(p_name, 'company')), '[^a-z0-9]+', '-', 'g'));
  v_base := trim(both '-' from left(v_base, 32));
  if length(v_base) < 3 then v_base := 'company'; end if;
  v_slug := v_base;
  while exists (select 1 from public.organizations where slug = v_slug) or v_slug = any (public.reserved_slugs()) loop
    n := n + 1; v_slug := v_base || '-' || n;
  end loop;
  return v_slug;
end $$;

create or replace function public.reserved_slugs()
returns text[] language sql immutable as $$
  select array['app','admin','console','login','start','onboarding','pending','api','auth','preview','support',
               'help','pricing','about','terms','privacy','static','assets','www','mail','billing','dashboard',
               'manifest','icon','sw','offline','5ime','fivetime','koraforge']
$$;

create or replace function public.set_org_slug()
returns trigger language plpgsql set search_path = pg_catalog, public, pg_temp as $$
begin
  if new.slug is null or trim(new.slug) = '' then new.slug := public.unique_org_slug(new.name); end if;
  new.slug := lower(trim(new.slug));
  if new.slug = any (public.reserved_slugs()) then raise exception 'That company link is reserved. Choose another.'; end if;
  return new;
end $$;
create trigger organizations_slug before insert or update of slug on public.organizations
  for each row execute function public.set_org_slug();

update public.organizations set slug = null where slug is null;  -- fires the trigger for existing companies
alter table public.organizations alter column slug set not null;
create unique index organizations_slug_key on public.organizations (slug);
alter table public.organizations
  add constraint organizations_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  add constraint organizations_brand_color_format check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$'),
  add constraint organizations_logo_url_format check (logo_url is null or (logo_url ~ '^https://' and length(logo_url) <= 500));
grant update (slug, logo_url, brand_color) on public.organizations to authenticated;

-- Public, minimal lookup for the branded sign-in page (name, logo, colour only).
create or replace function public.org_branding(p_slug text)
returns table (name text, slug text, logo_url text, brand_color text, domain text)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select o.name, o.slug, o.logo_url, o.brand_color, o.domain from public.organizations o
   where o.slug = lower(trim(p_slug)) and o.suspended_at is null
$$;
revoke all on function public.org_branding(text) from public;
grant execute on function public.org_branding(text) to anon, authenticated;

-- ───────────────────────────────────────────── staff first-run welcome
alter table public.members add column onboarded_at timestamptz;
create or replace function public.mark_onboarded()
returns void language sql security definer set search_path = pg_catalog, public, pg_temp as $$
  update public.members set onboarded_at = coalesce(onboarded_at, now()) where user_id = auth.uid();
$$;
revoke all on function public.mark_onboarded() from public, anon;
grant execute on function public.mark_onboarded() to authenticated;

-- ───────────────────────────────────────────── suspension blocks attendance
create or replace function public.block_suspended_org()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if exists (select 1 from public.organizations where id = new.org_id and suspended_at is not null) then
    raise exception 'This company''s 5ime account is suspended. Please contact your admin.';
  end if;
  return new;
end $$;
create trigger attendance_block_suspended before insert on public.attendance
  for each row execute function public.block_suspended_org();

-- Ownership transfer is allowed only from the console (session flag set inside that RPC).
create or replace function public.guard_member_changes()
returns trigger language plpgsql set search_path = pg_catalog, public, pg_temp as $$
begin
  if coalesce(current_setting('fivetime.console_owner_transfer', true), '') = 'on' then return new; end if;
  if old.role = 'owner' and (new.role <> 'owner' or new.status <> 'active') then
    raise exception 'The company owner cannot be demoted or disabled.';
  end if;
  if new.role = 'owner' and old.role <> 'owner' then
    raise exception 'Ownership cannot be assigned here.';
  end if;
  if new.role = 'manager' and old.role <> 'manager'
     and (select plan from public.subscriptions where org_id = new.org_id) = 'basic' then
    raise exception 'The Manager role is a Pro feature.';
  end if;
  return new;
end $$;

-- ───────────────────────────────────────────── payments: provider + complimentary terms
alter table public.payments add column provider text not null default 'paystack'
  check (provider in ('paystack','complimentary','korapay','monnify','payaza'));
alter table public.payments drop constraint if exists payments_amount_kobo_check;
alter table public.payments add constraint payments_amount_check
  check ((provider = 'complimentary' and amount_kobo = 0) or (provider <> 'complimentary' and amount_kobo > 0));
alter table public.payments add column note text;

-- ───────────────────────────────────────────── Kora Forge platform staff
create table public.platform_staff (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null,
  role text not null check (role in ('owner','support','finance','viewer')),
  created_at timestamptz not null default now()
);
alter table public.platform_staff enable row level security;
revoke all on public.platform_staff from public, anon, authenticated;

-- Console access requires a platform_staff row AND a two-factor (aal2) session.
create or replace function public.console_role()
returns text language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select p.role from public.platform_staff p
   where p.user_id = auth.uid() and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;
create or replace function public.is_console_staff()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (select 1 from public.platform_staff p where p.user_id = auth.uid())
$$;

create table public.platform_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_user uuid,
  actor_email text,
  org_id uuid references public.organizations on delete set null,
  action text not null,
  reason text,
  details jsonb not null default '{}'::jsonb
);
create index platform_audit_org_idx on public.platform_audit (org_id, at desc);
alter table public.platform_audit enable row level security;
revoke all on public.platform_audit from public, anon, authenticated;

create or replace function public.console_require(p_roles text[], p_reason text default null, p_need_reason boolean default false)
returns text language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_role text := public.console_role();
begin
  if v_role is null then raise exception 'Console access requires a Kora Forge staff account with two-factor sign-in.'; end if;
  if not (v_role = any (p_roles)) then raise exception 'Your console role (%) cannot do this.', v_role; end if;
  if p_need_reason and length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Give a short reason (at least 5 characters).'; end if;
  return v_role;
end $$;

create or replace function public.console_log(p_org uuid, p_action text, p_reason text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = pg_catalog, public, pg_temp as $$
  insert into public.platform_audit (actor_user, actor_email, org_id, action, reason, details)
  select auth.uid(), (select email from public.platform_staff where user_id = auth.uid()), p_org, p_action, nullif(trim(p_reason), ''), coalesce(p_details, '{}'::jsonb);
$$;

-- ───────────────────────────────────────────── client-controlled support access
create table public.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  granted_by uuid references public.members on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index support_access_org_idx on public.support_access_grants (org_id, expires_at desc);
alter table public.support_access_grants enable row level security;
revoke all on public.support_access_grants from public, anon, authenticated;
grant select on public.support_access_grants to authenticated;
create policy support_grants_admin_read on public.support_access_grants for select to authenticated
  using (org_id = public.my_org_id() and public.is_org_admin());

create or replace function public.support_access_until(p_org uuid)
returns timestamptz language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select max(expires_at) from public.support_access_grants
   where org_id = p_org and revoked_at is null and expires_at > now()
$$;

create or replace function public.grant_support_access(p_hours integer)
returns timestamptz language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_member uuid; v_until timestamptz;
begin
  if not public.is_org_admin() then raise exception 'Only company admins can grant support access.'; end if;
  if p_hours not in (24, 72) then raise exception 'Choose 24 or 72 hours.'; end if;
  select id into v_member from public.members where user_id = auth.uid();
  update public.support_access_grants set revoked_at = now() where org_id = v_org and revoked_at is null and expires_at > now();
  v_until := now() + make_interval(hours => p_hours);
  insert into public.support_access_grants (org_id, granted_by, expires_at) values (v_org, v_member, v_until);
  return v_until;
end $$;

create or replace function public.revoke_support_access()
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not public.is_org_admin() then raise exception 'Only company admins can change support access.'; end if;
  update public.support_access_grants set revoked_at = now()
   where org_id = public.my_org_id() and revoked_at is null and expires_at > now();
end $$;

-- What Kora Forge support looked at / changed in this company (shown on the company's Settings page).
create or replace function public.my_support_log()
returns table (at timestamptz, action text, actor_email text, reason text)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select a.at, a.action, a.actor_email, a.reason from public.platform_audit a
   where public.is_org_admin() and a.org_id = public.my_org_id()
   order by a.at desc limit 100
$$;

-- ───────────────────────────────────────────── console reads (company-level only)
create or replace function public.console_overview()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare r jsonb;
begin
  perform public.console_require(array['owner','support','finance','viewer']);
  select jsonb_build_object(
    'companies', (select count(*) from organizations),
    'trialing', (select count(*) from subscriptions where status = 'trialing' and trial_ends_at > now()),
    'paying', (select count(*) from subscriptions where status in ('active','past_due') and current_period_end > now()),
    'expired', (select count(*) from subscriptions s where not ((s.status = 'trialing' and s.trial_ends_at > now())
                  or (s.status in ('active','past_due') and s.current_period_end > now()))),
    'suspended', (select count(*) from organizations where suspended_at is not null),
    'seats_used', (select count(*) from members where status in ('active','invited')),
    'seats_paid', (select coalesce(sum(seats_paid),0) from subscriptions where status in ('active','past_due') and current_period_end > now()),
    'revenue_month_kobo', (select coalesce(sum(amount_kobo),0) from payments where status = 'applied' and applied_at >= date_trunc('month', now())),
    'new_this_week', (select count(*) from organizations where created_at > now() - interval '7 days'),
    'ending_soon', (select count(*) from subscriptions where (status = 'trialing' and trial_ends_at between now() and now() + interval '7 days')
                      or (status in ('active','past_due') and current_period_end between now() and now() + interval '7 days'))
  ) into r;
  return r;
end $$;

create or replace function public.console_companies(p_search text default null)
returns table (id uuid, name text, domain text, slug text, plan text, status text, trial_ends_at timestamptz,
  current_period_end timestamptz, seats_paid int, seats_used bigint, created_at timestamptz,
  suspended_at timestamptz, owner_email text, last_check_in timestamptz, support_until timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','finance','viewer']);
  return query
    select o.id, o.name, o.domain, o.slug, s.plan, s.status, s.trial_ends_at, s.current_period_end, s.seats_paid,
      (select count(*) from members m where m.org_id = o.id and m.status in ('active','invited')),
      o.created_at, o.suspended_at,
      (select m.email from members m where m.org_id = o.id and m.role = 'owner' limit 1),
      (select max(a.at) from attendance a where a.org_id = o.id),
      public.support_access_until(o.id)
    from organizations o left join subscriptions s on s.org_id = o.id
    where p_search is null or trim(p_search) = '' or o.name ilike '%' || trim(p_search) || '%'
      or o.domain ilike '%' || trim(p_search) || '%' or o.slug ilike '%' || trim(p_search) || '%'
    order by o.created_at desc
    limit 500;
end $$;

create or replace function public.console_company(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare o organizations%rowtype; s subscriptions%rowtype;
begin
  perform public.console_require(array['owner','support','finance','viewer']);
  select * into o from organizations where id = p_org;
  if not found then raise exception 'Company not found.'; end if;
  select * into s from subscriptions where org_id = p_org;
  return jsonb_build_object(
    'org', jsonb_build_object('id', o.id, 'name', o.name, 'domain', o.domain, 'slug', o.slug, 'timezone', o.timezone,
             'created_at', o.created_at, 'suspended_at', o.suspended_at, 'logo_url', o.logo_url),
    'owner', (select jsonb_build_object('name', m.full_name, 'email', m.email) from members m where m.org_id = p_org and m.role = 'owner' limit 1),
    'subscription', to_jsonb(s) - 'paystack_customer',
    'counts', jsonb_build_object(
      'active', (select count(*) from members where org_id = p_org and status = 'active'),
      'invited', (select count(*) from members where org_id = p_org and status = 'invited'),
      'pending', (select count(*) from members where org_id = p_org and status = 'pending'),
      'disabled', (select count(*) from members where org_id = p_org and status = 'disabled'),
      'stale_invites', (select count(*) from members where org_id = p_org and status = 'invited' and created_at < now() - interval '3 days'),
      'offices', (select count(*) from locations where org_id = p_org)),
    'last_check_in', (select max(at) from attendance where org_id = p_org),
    'support_until', public.support_access_until(p_org),
    'payments', coalesce((select jsonb_agg(p order by p.created_at desc) from (
        select reference, provider, kind, status, plan, seats, billing_interval_months, amount_kobo, created_at, applied_at, note
          from payments where org_id = p_org order by created_at desc limit 25) p), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(a order by a.at desc) from (
        select at, action, actor_email, reason from platform_audit where org_id = p_org order by at desc limit 25) a), '[]'::jsonb)
  );
end $$;

create or replace function public.console_audit(p_limit integer default 200)
returns table (at timestamptz, actor_email text, org_name text, action text, reason text, details jsonb)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','finance','viewer']);
  return query select a.at, a.actor_email, o.name, a.action, a.reason, a.details
    from platform_audit a left join organizations o on o.id = a.org_id
    order by a.at desc limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end $$;

-- Staff list: only while the company has granted support access. Every view is logged.
create or replace function public.console_staff_list(p_org uuid)
returns table (full_name text, email text, role text, status text, team text, home_status text, last_check_in timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support']);
  if public.support_access_until(p_org) is null then
    raise exception 'This company has not granted support access. Ask their admin to grant it in Settings.';
  end if;
  perform public.console_log(p_org, 'support.view_staff', null, '{}'::jsonb);
  return query select m.full_name, m.email, m.role, m.status, m.team, m.home_status,
      (select max(a.at) from attendance a where a.member_id = m.id)
    from members m where m.org_id = p_org order by m.created_at;
end $$;

-- ───────────────────────────────────────────── console actions (all logged with a reason)
create or replace function public.console_extend_trial(p_org uuid, p_days integer, p_reason text)
returns timestamptz language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare s subscriptions%rowtype; v_until timestamptz;
begin
  perform public.console_require(array['owner','support'], p_reason, true);
  if p_days is null or p_days < 1 or p_days > 90 then raise exception 'Extend by 1 to 90 days.'; end if;
  select * into s from subscriptions where org_id = p_org for update;
  if not found then raise exception 'Company not found.'; end if;
  if s.status in ('active','past_due') and s.current_period_end > now() then
    raise exception 'This company is on a paid term. Use a complimentary term instead.';
  end if;
  v_until := greatest(now(), coalesce(s.trial_ends_at, now())) + make_interval(days => p_days);
  update subscriptions set status = 'trialing', trial_ends_at = v_until, updated_at = now() where org_id = p_org;
  perform public.console_log(p_org, 'trial.extend', p_reason, jsonb_build_object('days', p_days, 'until', v_until));
  return v_until;
end $$;

create or replace function public.console_grant_complimentary(p_org uuid, p_plan text, p_seats integer, p_months integer, p_reason text)
returns timestamptz language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare s subscriptions%rowtype; v_base timestamptz; v_ref text := 'comp-' || replace(gen_random_uuid()::text, '-', '');
  v_used integer; v_running boolean;
begin
  perform public.console_require(array['owner','finance'], p_reason, true);
  if p_plan not in ('basic','pro') or p_months not in (1,3,6,12) or p_seats is null or p_seats < 1 or p_seats > 10000 then
    raise exception 'Choose basic or pro, 1/3/6/12 months and at least 1 seat.';
  end if;
  select * into s from subscriptions where org_id = p_org for update;
  if not found then raise exception 'Company not found.'; end if;
  if s.paystack_subscription_code is not null and not s.cancel_at_period_end then
    raise exception 'This company has automatic card renewal on. Ask them to turn it off first.';
  end if;
  if exists (select 1 from payments where org_id = p_org and status = 'pending') then
    raise exception 'This company has a pending checkout. Resolve it first.';
  end if;
  select count(*)::int into v_used from members where org_id = p_org and status in ('active','invited');
  if p_seats < v_used then raise exception 'They have % active/invited people; grant at least that many seats.', v_used; end if;
  v_running := s.status in ('active','past_due') and s.current_period_end > now();
  if v_running and p_plan <> s.plan then raise exception 'Their current term is on %. Grant the same plan.', s.plan; end if;
  v_base := case when v_running then s.current_period_end
                 when s.status = 'trialing' and s.trial_ends_at > now() then s.trial_ends_at
                 else now() end;
  insert into payments (reference, org_id, plan, seats, billing_interval_months, amount_kobo, currency, status, kind, provider, applied_at, note)
    values (v_ref, p_org, p_plan, p_seats, p_months, 0, 'NGN', 'applied', 'subscription', 'complimentary', now(), trim(p_reason));
  update subscriptions set plan = p_plan, status = 'active',
      seats_paid = case when v_running then greatest(p_seats, s.seats_paid) else p_seats end,
      billing_interval_months = p_months, current_period_start = v_base,
      current_period_end = v_base + make_interval(months => p_months),
      paystack_subscription_code = null, paystack_plan_code = null, cancel_at_period_end = false,
      last_reference = v_ref, updated_at = now()
    where org_id = p_org;
  perform public.console_log(p_org, 'billing.complimentary', p_reason,
    jsonb_build_object('plan', p_plan, 'seats', p_seats, 'months', p_months, 'reference', v_ref));
  return v_base + make_interval(months => p_months);
end $$;

create or replace function public.console_set_suspended(p_org uuid, p_suspend boolean, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner'], p_reason, true);
  update organizations set suspended_at = case when p_suspend then now() else null end where id = p_org;
  if not found then raise exception 'Company not found.'; end if;
  perform public.console_log(p_org, case when p_suspend then 'company.suspend' else 'company.reactivate' end, p_reason, '{}'::jsonb);
end $$;

create or replace function public.console_invite_member(p_org uuid, p_email text, p_name text, p_reason text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_domain text; v_email text := lower(trim(p_email)); v_id uuid; s subscriptions%rowtype; v_used int;
begin
  perform public.console_require(array['owner','support'], p_reason, true);
  select domain into v_domain from organizations where id = p_org;
  if v_domain is null then raise exception 'Company not found.'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid work email address.'; end if;
  if split_part(v_email, '@', 2) <> v_domain then raise exception '% is not a @% address.', v_email, v_domain; end if;
  select * into s from subscriptions where org_id = p_org for update;
  if s.status <> 'trialing' then
    select count(*)::int into v_used from members where org_id = p_org and status in ('active','invited');
    if v_used >= s.seats_paid then raise exception 'Their paid seats are full (%). Add seats or grant a complimentary term first.', s.seats_paid; end if;
  end if;
  insert into members (org_id, email, full_name, role, status) values (p_org, v_email, nullif(trim(p_name), ''), 'staff', 'invited')
    returning id into v_id;
  perform public.console_log(p_org, 'member.invite', p_reason, jsonb_build_object('email', v_email));
  return v_id;
exception when unique_violation then raise exception '% has already been added.', v_email;
end $$;

create or replace function public.console_transfer_ownership(p_org uuid, p_new_owner_email text, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_new uuid; v_old uuid;
begin
  perform public.console_require(array['owner'], p_reason, true);
  select id into v_new from members where org_id = p_org and lower(email) = lower(trim(p_new_owner_email)) and status = 'active';
  if v_new is null then raise exception 'The new owner must be an active member of this company.'; end if;
  select id into v_old from members where org_id = p_org and role = 'owner';
  perform set_config('fivetime.console_owner_transfer', 'on', true);
  update members set role = 'admin' where id = v_old and id <> v_new;
  update members set role = 'owner' where id = v_new;
  perform set_config('fivetime.console_owner_transfer', 'off', true);
  perform public.console_log(p_org, 'company.transfer_owner', p_reason, jsonb_build_object('new_owner', lower(trim(p_new_owner_email))));
end $$;

create or replace function public.console_update_domain(p_org uuid, p_domain text, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_old text; v_new text := lower(trim(p_domain));
begin
  perform public.console_require(array['owner'], p_reason, true);
  if v_new !~ '^[a-z0-9.-]+[.][a-z]{2,}$' or public.is_public_email_domain(v_new) then raise exception 'Enter a valid company email domain.'; end if;
  select domain into v_old from organizations where id = p_org;
  if v_old is null then raise exception 'Company not found.'; end if;
  update organizations set domain = v_new where id = p_org;
  perform public.console_log(p_org, 'company.domain', p_reason, jsonb_build_object('from', v_old, 'to', v_new));
end $$;

-- ───────────────────────────────────────────── grants
do $$
declare f text;
begin
  foreach f in array array[
    'public.console_overview()', 'public.console_companies(text)', 'public.console_company(uuid)',
    'public.console_audit(integer)', 'public.console_staff_list(uuid)',
    'public.console_extend_trial(uuid,integer,text)', 'public.console_grant_complimentary(uuid,text,integer,integer,text)',
    'public.console_set_suspended(uuid,boolean,text)', 'public.console_invite_member(uuid,text,text,text)',
    'public.console_transfer_ownership(uuid,text,text)', 'public.console_update_domain(uuid,text,text)',
    'public.is_console_staff()', 'public.console_role()',
    'public.grant_support_access(integer)', 'public.revoke_support_access()', 'public.my_support_log()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function public.console_require(text[],text,boolean) from public, anon, authenticated;
revoke all on function public.console_log(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.support_access_until(uuid) from public, anon, authenticated;
revoke all on function public.unique_org_slug(text) from public, anon, authenticated;

commit;
