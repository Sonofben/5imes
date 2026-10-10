-- 5ime hardening: private employee locations, tenant-safe schedules, billing ledger,
-- paid-seat enforcement, atomic schedule replacement and serialized overnight check-in.
-- Apply after 0001_init.sql. Validate on a staging database before production.

begin;

-- Keep home coordinates and approval requests out of the manager-readable members table.
alter table public.members
  add constraint members_org_id_id_key unique (org_id, id);

create table public.member_private_locations (
  member_id uuid primary key,
  org_id uuid not null,
  home_lat double precision check (home_lat between -90 and 90),
  home_lng double precision check (home_lng between -180 and 180),
  home_req_lat double precision check (home_req_lat between -90 and 90),
  home_req_lng double precision check (home_req_lng between -180 and 180),
  home_req_acc double precision check (home_req_acc >= 0 and home_req_acc <= 10000),
  home_req_at timestamptz,
  constraint member_private_locations_org_member_fk
    foreign key (org_id, member_id) references public.members (org_id, id) on delete cascade,
  constraint member_private_locations_home_pair check ((home_lat is null) = (home_lng is null)),
  constraint member_private_locations_request_pair check ((home_req_lat is null) = (home_req_lng is null))
);

insert into public.member_private_locations (
  member_id, org_id, home_lat, home_lng, home_req_lat, home_req_lng, home_req_acc, home_req_at
)
select id, org_id, home_lat, home_lng, home_req_lat, home_req_lng, home_req_acc, home_req_at
from public.members
where home_lat is not null or home_lng is not null or home_req_lat is not null or home_req_lng is not null
on conflict (member_id) do nothing;

alter table public.member_private_locations enable row level security;
revoke all on public.member_private_locations from anon, authenticated;
grant select on public.member_private_locations to authenticated;
drop policy if exists member_private_self_or_admin_read on public.member_private_locations;
create policy member_private_self_or_admin_read on public.member_private_locations for select to authenticated
using (
  member_id in (select m.id from public.members m where m.user_id = auth.uid() and m.status = 'active')
  or (org_id = public.my_org_id() and public.is_org_admin())
);

-- Exact check-in GPS is also sensitive (a home check-in can reveal a home address).
-- Preserve it for the employee and admins, but not managers reading the attendance feed.
alter table public.attendance add constraint attendance_id_org_member_key unique (id,org_id,member_id);
create table public.private_attendance_locations (
  attendance_id uuid primary key,
  org_id uuid not null,
  member_id uuid not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  constraint private_attendance_attendance_fk foreign key (attendance_id,org_id,member_id)
    references public.attendance (id,org_id,member_id) on delete cascade,
  constraint private_attendance_member_fk foreign key (org_id,member_id)
    references public.members (org_id,id) on delete cascade
);
insert into public.private_attendance_locations(attendance_id,org_id,member_id,lat,lng)
select id,org_id,member_id,lat,lng from public.attendance where lat is not null and lng is not null;
alter table public.private_attendance_locations enable row level security;
revoke all on public.private_attendance_locations from public,anon,authenticated;
grant select on public.private_attendance_locations to authenticated;
create policy private_attendance_self_or_admin_read on public.private_attendance_locations for select to authenticated
using (
  member_id in (select m.id from public.members m where m.user_id=auth.uid() and m.status='active')
  or (org_id=public.my_org_id() and public.is_org_admin())
);

-- Enforce attendance tenant relationships, including the optional office location.
do $$
begin
  if exists (select 1 from public.attendance a join public.members m on m.id=a.member_id where a.org_id<>m.org_id) then
    raise exception 'Cross-organization attendance rows exist. Correct them before applying migration 0002.';
  end if;
  if exists (select 1 from public.attendance a join public.locations l on l.id=a.location_id where a.location_id is not null and a.org_id<>l.org_id) then
    raise exception 'Cross-organization attendance locations exist. Correct them before applying migration 0002.';
  end if;
end $$;
alter table public.locations add constraint locations_org_id_id_key unique (org_id,id);
alter table public.attendance drop constraint if exists attendance_member_id_fkey;
alter table public.attendance drop constraint if exists attendance_location_id_fkey;
alter table public.attendance
  add constraint attendance_member_tenant_fk foreign key (org_id,member_id)
    references public.members (org_id,id) on delete cascade,
  add constraint attendance_location_tenant_fk foreign key (org_id,location_id)
    references public.locations (org_id,id) on delete set null (location_id);
alter table public.attendance drop column lat, drop column lng;

alter table public.members
  drop column home_lat,
  drop column home_lng,
  drop column home_req_lat,
  drop column home_req_lng,
  drop column home_req_acc,
  drop column home_req_at;

-- Tenant identity is enforced by the database, not solely by the form/action.
do $$
begin
  if exists (
    select 1 from public.schedules s
    join public.members m on m.id = s.member_id
    where s.member_id is not null and s.org_id <> m.org_id
  ) then
    raise exception 'Cross-organization schedules exist. Correct them before applying migration 0002.';
  end if;
end $$;

alter table public.schedules drop constraint if exists schedules_member_id_fkey;
alter table public.schedules
  add constraint schedules_member_tenant_fk
  foreign key (org_id, member_id) references public.members (org_id, id) on delete cascade;

-- Persist the billing term and provider subscription identifiers without exposing them to clients.
alter table public.subscriptions
  add column billing_interval_months integer not null default 1 check (billing_interval_months in (1, 3, 6, 12)),
  add column paystack_plan_code text,
  add column paystack_subscription_code text unique,
  add column cancel_at_period_end boolean not null default false,
  add column current_period_start timestamptz;
update public.subscriptions set current_period_start=current_period_end-interval '30 days'
  where current_period_end is not null and status in ('active','past_due') and billing_interval_months=1;
update public.subscriptions set current_period_start=current_period_end-make_interval(months=>billing_interval_months)
  where current_period_end is not null and status in ('active','past_due') and billing_interval_months in (3,6,12);
create unique index subscriptions_paystack_plan_code_key on public.subscriptions(paystack_plan_code) where paystack_plan_code is not null;

create table public.private_subscription_auth (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  paystack_email_token text not null,
  updated_at timestamptz not null default now()
);
alter table public.private_subscription_auth enable row level security;
revoke all on public.private_subscription_auth from public, anon, authenticated;
grant all on public.private_subscription_auth to service_role;

create table public.payments (
  reference text primary key check (reference ~ '^[A-Za-z0-9.=\\-]{1,100}$'),
  org_id uuid not null references public.organizations (id) on delete cascade,
  plan text not null check (plan in ('basic', 'pro')),
  seats integer not null check (seats >= 1),
  billing_interval_months integer not null check (billing_interval_months in (1, 3, 6, 12)),
  amount_kobo bigint not null check (amount_kobo > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  status text not null default 'pending' check (status in ('pending', 'applied', 'failed')),
  kind text not null default 'subscription' check (kind in ('subscription', 'seat_increase')),
  paystack_customer text,
  paystack_plan_code text,
  paystack_subscription_code text,
  checkout_url text,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  renewal_sync_status text not null default 'not_required' check (renewal_sync_status in ('not_required', 'pending', 'synced')),
  renewal_sync_error text,
  last_status_check_at timestamptz
);
create index payments_org_created_idx on public.payments (org_id, created_at desc);
create index payments_provider_plan_idx on public.payments (paystack_plan_code) where paystack_plan_code is not null;
alter table public.payments enable row level security;
revoke all on public.payments from public, anon, authenticated;

-- Reserve one initial subscription checkout per organization before calling Paystack.
-- Locking the subscription row serializes concurrent browser submissions and seat changes.
create or replace function public.prepare_paystack_subscription(
  p_reference text, p_plan text, p_seats integer, p_months integer
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_sub public.subscriptions%rowtype; v_used integer;
  v_now timestamptz := clock_timestamp(); v_price integer; v_amount bigint;
begin
  if auth.uid() is null or not public.is_org_admin() or v_org is null then raise exception 'Only this company''s admins can change billing.'; end if;
  if p_reference is null or p_reference !~ '^[-A-Za-z0-9.=]{1,100}$'
    or p_plan is null or p_plan not in ('basic','pro') or p_seats is null or p_seats < 1 or p_seats > 10000
    or p_months is null or p_months not in (1,3,6,12) then raise exception 'Subscription checkout details are invalid.'; end if;
  select * into v_sub from public.subscriptions where org_id=v_org for update;
  if not found then raise exception 'Subscription record was not found.'; end if;
  if ((v_sub.status in ('active','past_due') and v_sub.current_period_end>v_now)
      or (v_sub.cancel_at_period_end and v_sub.current_period_end>v_now)
      or (v_sub.paystack_subscription_code is not null and not v_sub.cancel_at_period_end)) then
    raise exception 'An existing subscription is still active or renewing.';
  end if;
  if exists(select 1 from public.payments where org_id=v_org and status='pending' and kind='seat_increase') then
    raise exception 'A seat payment is still unresolved. Check that checkout before starting a new subscription.';
  end if;
  if exists(select 1 from public.payments where org_id=v_org and status='pending' and kind='subscription') then
    raise exception 'A subscription checkout is already pending. Resume or check that payment before starting another.';
  end if;
  select count(*)::integer into v_used from public.members where org_id=v_org and status in ('active','invited');
  if p_seats<greatest(1,v_used) then raise exception 'The seat count cannot be below active and invited people.'; end if;
  v_price := case p_plan when 'basic' then 250 else 500 end;
  v_amount := p_seats::bigint*v_price*p_months*100;
  insert into public.payments(reference,org_id,plan,seats,billing_interval_months,amount_kobo,currency,status,kind)
    values(p_reference,v_org,p_plan,p_seats,p_months,v_amount,'NGN','pending','subscription');
  return jsonb_build_object('ok',true,'reference',p_reference,'amount_kobo',v_amount,'seats',p_seats,'months',p_months);
end $$;

create or replace function public.prepare_paystack_seat_increase(p_reference text, p_seats integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_sub public.subscriptions%rowtype; v_used integer;
  v_now timestamptz := clock_timestamp(); v_duration numeric; v_remaining numeric;
  v_amount bigint; v_price integer; v_interval integer;
begin
  if auth.uid() is null or not public.is_org_admin() or v_org is null then raise exception 'Only this company''s admins can add seats.'; end if;
  if p_reference is null or p_reference !~ '^[-A-Za-z0-9.=]{1,100}$' or p_seats is null or p_seats < 1 or p_seats > 10000 then
    raise exception 'Seat checkout details are invalid.';
  end if;
  select * into v_sub from public.subscriptions where org_id=v_org for update;
  if not found or v_sub.status<>'active' or v_sub.cancel_at_period_end or v_sub.current_period_start is null
    or v_sub.current_period_end is null or v_sub.current_period_end<=v_now
    or v_sub.paystack_plan_code is null or v_sub.paystack_subscription_code is null then
    raise exception 'An active Paystack subscription is required to add prorated seats.';
  end if;
  if p_seats<=v_sub.seats_paid then raise exception 'Choose more seats than the current paid limit.'; end if;
  select count(*)::integer into v_used from public.members where org_id=v_org and status in ('active','invited');
  if p_seats<v_used then raise exception 'Seat capacity cannot be below active and invited members.'; end if;
  if exists(select 1 from public.payments where org_id=v_org and kind='subscription' and status='pending') then
    raise exception 'A subscription checkout is pending. Resolve that checkout before changing seat capacity.';
  end if;
  if exists(select 1 from public.payments where org_id=v_org and kind='seat_increase' and status='pending') then
    raise exception 'A seat-increase payment is already pending. Complete it or check its status before starting another.';
  end if;
  v_duration := extract(epoch from (v_sub.current_period_end-v_sub.current_period_start));
  v_remaining := extract(epoch from (v_sub.current_period_end-v_now));
  if v_duration<=0 or v_remaining<=0 then raise exception 'The current billing period cannot be prorated.'; end if;
  v_price := case v_sub.plan when 'basic' then 250 else 500 end;
  v_interval := v_sub.billing_interval_months;
  v_amount := greatest(1,round((p_seats-v_sub.seats_paid)::numeric*v_price*v_interval*100*v_remaining/v_duration)::bigint);
  insert into public.payments(reference,org_id,plan,seats,billing_interval_months,amount_kobo,currency,status,kind,paystack_plan_code)
    values(p_reference,v_org,v_sub.plan,p_seats,v_sub.billing_interval_months,v_amount,'NGN','pending','seat_increase',v_sub.paystack_plan_code);
  return jsonb_build_object('ok',true,'reference',p_reference,'amount_kobo',v_amount,'added_seats',p_seats-v_sub.seats_paid);
end $$;

-- Preserve existing access through the trial; give existing paid accounts a seat baseline
-- only when older data did not record one. Future paid activations use the verified ledger.
update public.subscriptions s
set seats_paid = greatest(s.seats_paid, coalesce((
  select count(*)::integer from public.members m
  where m.org_id = s.org_id and m.status in ('active', 'invited')
), 0))
where s.status in ('active', 'past_due') and s.seats_paid = 0;

-- Validate timezone names at the database boundary.
do $$
begin
  if exists (select 1 from public.organizations o where not exists (
    select 1 from pg_catalog.pg_timezone_names z where z.name = o.timezone
  )) then
    raise exception 'An organization has an invalid time zone. Correct it before applying migration 0002.';
  end if;
end $$;

create or replace function public.validate_org_timezone()
returns trigger language plpgsql set search_path = pg_catalog, public, pg_temp as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'Choose a valid IANA time zone.';
  end if;
  return new;
end $$;
drop trigger if exists organizations_timezone_guard on public.organizations;
create trigger organizations_timezone_guard before insert or update of timezone on public.organizations
for each row execute function public.validate_org_timezone();

-- A pending member approval may activate one of the seats already purchased, never exceed the cap.
create or replace function public.enforce_paid_seat_cap()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_sub public.subscriptions%rowtype; v_used integer;
begin
  if new.status not in ('active', 'invited') then return new; end if;
  if tg_op = 'UPDATE' and old.status in ('active', 'invited') then return new; end if;
  select * into v_sub from public.subscriptions where org_id = new.org_id for update;
  if not found or v_sub.status = 'trialing' then return new; end if;
  select count(*)::integer into v_used from public.members
    where org_id = new.org_id and status in ('active', 'invited') and id is distinct from new.id;
  if v_used >= v_sub.seats_paid then
    raise exception 'This organization has reached its paid-seat limit. Add seats before inviting or approving another person.';
  end if;
  return new;
end $$;
drop trigger if exists members_paid_seat_guard on public.members;
create trigger members_paid_seat_guard before insert or update of status on public.members
for each row execute function public.enforce_paid_seat_cap();

-- Replace invite RPC with an explicit paid-seat check.
create or replace function public.invite_member(p_email text, p_name text, p_role text default 'staff', p_team text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_domain text; v_email text := lower(trim(p_email)); v_id uuid;
  v_sub public.subscriptions%rowtype; v_used integer;
begin
  if auth.uid() is null or not public.is_org_admin() then raise exception 'Only admins can invite staff.'; end if;
  if p_role not in ('admin','manager','staff') then raise exception 'Invalid role.'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid work email address.'; end if;
  select domain into v_domain from public.organizations where id = v_org;
  if split_part(v_email, '@', 2) <> v_domain then raise exception '% is not a @% address.', v_email, v_domain; end if;
  select * into v_sub from public.subscriptions where org_id = v_org for update;
  if p_role = 'manager' and v_sub.plan = 'basic' then raise exception 'The Manager role is a Pro feature.'; end if;
  if v_sub.status <> 'trialing' then
    select count(*)::integer into v_used from public.members where org_id = v_org and status in ('active','invited');
    if v_used >= v_sub.seats_paid then raise exception 'Your paid seats are full. Add seats before sending another invite.'; end if;
  end if;
  insert into public.members (org_id, email, full_name, role, status, team)
    values (v_org, v_email, nullif(trim(p_name), ''), p_role, 'invited', nullif(trim(p_team), ''))
    returning id into v_id;
  return v_id;
exception when unique_violation then raise exception '% has already been added.', v_email;
end $$;

-- Atomic bulk invite: quoted CSV is parsed in the app, then all valid rows commit or none do.
create or replace function public.invite_members_bulk(p_members jsonb)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_domain text; v_sub public.subscriptions%rowtype;
  v_used integer; v_total integer; v_item jsonb; v_email text; v_count integer := 0;
begin
  if auth.uid() is null or not public.is_org_admin() then raise exception 'Only admins can invite staff.'; end if;
  if jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) > 500 then raise exception 'Provide up to 500 staff rows.'; end if;
  select domain into v_domain from public.organizations where id = v_org;
  select * into v_sub from public.subscriptions where org_id = v_org for update;
  v_total := jsonb_array_length(p_members);
  if v_sub.status <> 'trialing' then
    select count(*)::integer into v_used from public.members where org_id = v_org and status in ('active','invited');
    if v_used + v_total > v_sub.seats_paid then raise exception 'These invites exceed your paid-seat limit. Add seats before importing this list.'; end if;
  end if;
  if exists (
    select lower(trim(coalesce(value->>'email','')))
    from jsonb_array_elements(p_members) group by 1 having count(*) > 1
  ) then raise exception 'The import contains duplicate email addresses.'; end if;
  for v_item in select value from jsonb_array_elements(p_members) loop
    v_email := lower(trim(coalesce(v_item->>'email','')));
    if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Invalid email in import: %', v_email; end if;
    if split_part(v_email,'@',2) <> v_domain then raise exception '% is not a @% address.', v_email, v_domain; end if;
    if exists (select 1 from public.members where org_id = v_org and lower(email) = v_email) then raise exception '% has already been added.', v_email; end if;
    insert into public.members (org_id,email,full_name,role,status,team)
      values (v_org,v_email,nullif(trim(coalesce(v_item->>'name','')),''),'staff','invited',nullif(trim(coalesce(v_item->>'team','')),''));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Atomic schedule replacement. Company-wide default schedules are allowed on either plan;
-- per-member schedules require Pro and a member from the same organization.
create or replace function public.replace_schedule(p_org uuid, p_member uuid, p_rows jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_sub public.subscriptions%rowtype; v_item jsonb; v_weekday integer; v_mode text;
begin
  if auth.uid() is null or not public.is_org_admin() or p_org <> public.my_org_id() then raise exception 'Only this company''s admins can change schedules.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 7 then raise exception 'Invalid schedule rows.'; end if;
  select * into v_sub from public.subscriptions where org_id = p_org;
  if p_member is not null then
    if not exists (select 1 from public.members where id = p_member and org_id = p_org) then raise exception 'That person does not belong to this company.'; end if;
    if v_sub.plan <> 'pro' then raise exception 'Per-person schedules are a Pro feature.'; end if;
  end if;
  for v_item in select value from jsonb_array_elements(p_rows) loop
    v_weekday := (v_item->>'weekday')::integer;
    v_mode := v_item->>'mode';
    if v_weekday < 1 or v_weekday > 7 or v_mode not in ('office','home','off') then raise exception 'Invalid weekday or work mode.'; end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_rows) x(value) group by (x.value->>'weekday') having count(*) > 1) then raise exception 'A weekday can only appear once.'; end if;
  delete from public.schedules where org_id = p_org and member_id is not distinct from p_member;
  insert into public.schedules (org_id, member_id, weekday, mode)
    select p_org, p_member, (value->>'weekday')::integer, value->>'mode' from jsonb_array_elements(p_rows);
end $$;

-- Record verified payment and extend service atomically. A recurring charge is resolved by its
-- Paystack subscription or plan code. Retries are idempotent by the unique payment reference.
create or replace function public.apply_paystack_payment(
  p_reference text, p_status text, p_amount_kobo bigint, p_currency text,
  p_customer_code text default null, p_subscription_code text default null,
  p_plan_code text default null, p_email_token text default null
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_payment public.payments%rowtype; v_sub public.subscriptions%rowtype;
  v_org uuid; v_plan text; v_seats integer; v_months integer; v_expected bigint;
  v_base timestamptz; v_inserted integer; v_claim_status text; v_kind text := 'subscription';
begin
  if p_status <> 'success' then
    if p_status in ('failed','abandoned','reversed') then
      update public.payments set status = 'failed' where reference = p_reference and status = 'pending';
    end if;
    return jsonb_build_object('ok', false, 'reason', 'payment not successful');
  end if;
  if coalesce(p_currency,'') <> 'NGN' or p_amount_kobo is null or p_amount_kobo < 1 then
    return jsonb_build_object('ok', false, 'reason', 'currency or amount invalid');
  end if;

  select * into v_payment from public.payments where reference = p_reference for update;
  if found then
    if v_payment.status = 'applied' then return jsonb_build_object('ok', true, 'reason', 'already applied'); end if;
    if v_payment.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'payment reference is not pending'); end if;
    v_org := v_payment.org_id; v_plan := v_payment.plan; v_seats := v_payment.seats; v_months := v_payment.billing_interval_months;
    v_kind := v_payment.kind;
    v_expected := v_payment.amount_kobo;
  else
    select * into v_sub from public.subscriptions s
      where (p_subscription_code is not null and s.paystack_subscription_code = p_subscription_code)
         or (p_plan_code is not null and s.paystack_plan_code = p_plan_code)
      order by case when s.paystack_subscription_code = p_subscription_code then 0 else 1 end
      limit 1 for update;
    if not found then return jsonb_build_object('ok', false, 'reason', 'no matching pending payment or subscription'); end if;
    v_org := v_sub.org_id; v_plan := v_sub.plan; v_seats := v_sub.seats_paid; v_months := v_sub.billing_interval_months;
    v_expected := v_seats * (case v_plan when 'basic' then 250 else 500 end)::bigint * v_months * 100;
  end if;

  if p_amount_kobo <> v_expected then
    update public.payments set status = 'failed' where reference = p_reference and status = 'pending';
    return jsonb_build_object('ok', false, 'reason', 'verified amount does not match the expected charge');
  end if;
  if v_seats < 1 or v_months not in (1,3,6,12) then return jsonb_build_object('ok', false, 'reason', 'subscription details invalid'); end if;
  if v_payment.reference is not null and v_payment.kind='subscription' and v_payment.amount_kobo <>
    v_payment.seats * (case v_payment.plan when 'basic' then 250 else 500 end)::bigint * v_payment.billing_interval_months * 100 then
    return jsonb_build_object('ok', false, 'reason', 'checkout amount does not match current pricing');
  end if;

  select * into v_sub from public.subscriptions where org_id = v_org for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'subscription not found'); end if;
  if v_kind='seat_increase' then
    if v_sub.status not in ('active','past_due')
      or v_sub.paystack_plan_code is distinct from v_payment.paystack_plan_code
      or v_sub.plan is distinct from v_payment.plan or v_sub.billing_interval_months<>v_payment.billing_interval_months then
      return jsonb_build_object('ok',false,'reason','subscription changed while the seat payment was pending');
    end if;
    if v_seats<=v_sub.seats_paid or v_seats<=(select count(*) from public.members where org_id=v_org and status in ('active','invited')) then
      return jsonb_build_object('ok',false,'reason','seat increase is no longer valid');
    end if;
    update public.subscriptions set seats_paid=v_seats,updated_at=now() where org_id=v_org;
    update public.payments set status='applied',applied_at=now(),renewal_sync_status='pending',renewal_sync_error=null
      where reference=p_reference and status='pending';
    return jsonb_build_object('ok',true,'reason','prorated seats applied; renewal price sync pending','kind','seat_increase','seats',v_seats);
  end if;
  -- Claim a recurring reference while holding the subscription lock. A concurrent replay
  -- must observe the existing row before it can extend the term a second time.
  if v_payment.reference is null then
    insert into public.payments(reference,org_id,plan,seats,billing_interval_months,amount_kobo,currency,status,
      paystack_customer,paystack_plan_code,paystack_subscription_code)
    values(p_reference,v_org,v_plan,v_seats,v_months,p_amount_kobo,'NGN','pending',p_customer_code,p_plan_code,p_subscription_code)
    on conflict (reference) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      select status into v_claim_status from public.payments where reference=p_reference;
      if v_claim_status='applied' then return jsonb_build_object('ok',true,'reason','already applied'); end if;
      return jsonb_build_object('ok',false,'reason','payment reference is already being processed');
    end if;
    v_payment.reference := p_reference;
  end if;
  v_base := greatest(now(), coalesce(v_sub.current_period_end, now()));
  update public.subscriptions set
    plan = v_plan,
    status = 'active',
    seats_paid = v_seats,
    billing_interval_months = v_months,
    current_period_start = v_base,
    current_period_end = v_base + make_interval(months => v_months),
    paystack_customer = coalesce(p_customer_code, v_sub.paystack_customer),
    paystack_subscription_code = coalesce(p_subscription_code, v_sub.paystack_subscription_code),
    paystack_plan_code = coalesce(p_plan_code, v_sub.paystack_plan_code),
    cancel_at_period_end = false,
    last_reference = p_reference,
    updated_at = now()
  where org_id = v_org;
  update public.payments set status = 'applied', applied_at = now(), paystack_customer = p_customer_code,
    paystack_subscription_code = coalesce(p_subscription_code, paystack_subscription_code)
  where reference = p_reference and status = 'pending';
  return jsonb_build_object('ok', true, 'reason', 'applied');
end $$;

create or replace function public.record_paystack_subscription(
  p_plan_code text, p_subscription_code text, p_customer_code text, p_email_token text
)
returns boolean language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid; v_current_plan text; v_latest_plan text;
begin
  if p_plan_code is null or p_subscription_code is null then return false; end if;
  select org_id into v_org from public.subscriptions where paystack_plan_code=p_plan_code for update;
  if v_org is null then
    select org_id into v_org from public.payments
      where paystack_plan_code=p_plan_code and kind='subscription' and status in ('pending','applied')
      order by created_at desc,reference desc limit 1;
  end if;
  if v_org is null then return false; end if;
  select paystack_plan_code into v_current_plan from public.subscriptions where org_id=v_org for update;
  if not found then return false; end if;
  if v_current_plan is distinct from p_plan_code then
    select paystack_plan_code into v_latest_plan from public.payments
      where org_id=v_org and kind='subscription' and status in ('pending','applied')
      order by created_at desc,reference desc limit 1;
    -- A delayed event for a known superseded plan is acknowledged without changing current state.
    if v_latest_plan is distinct from p_plan_code then return true; end if;
  end if;
  update public.subscriptions set paystack_plan_code = p_plan_code,
    paystack_subscription_code = p_subscription_code,
    paystack_customer = coalesce(p_customer_code, paystack_customer), updated_at = now()
  where org_id = v_org;
  if p_email_token is not null then
    insert into public.private_subscription_auth(org_id,paystack_email_token,updated_at)
      values (v_org,p_email_token,now())
    on conflict (org_id) do update set paystack_email_token=excluded.paystack_email_token,updated_at=now();
  end if;
  return found;
end $$;

create or replace function public.mark_paystack_invoice_failed(p_subscription_code text, p_expected_period_end timestamptz)
returns boolean language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  update public.subscriptions set status = 'past_due', updated_at = clock_timestamp()
  where paystack_subscription_code = p_subscription_code and status = 'active'
    and current_period_end is not distinct from p_expected_period_end;
  return found;
end $$;

-- Release only an aged, still-pending reservation after the server has verified that Paystack has no transaction for its reference.
create or replace function public.release_missing_paystack_checkout(p_reference text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if p_reference is null then return false; end if;
  update public.payments set status='failed'
  where reference=p_reference and status='pending' and kind in ('subscription','seat_increase')
    and created_at <= clock_timestamp() - interval '10 minutes';
  return found;
end $$;

create or replace function public.set_paystack_subscription_cancelled(
  p_subscription_code text, p_cancelled boolean, p_expected_updated_at timestamptz default null
)
returns boolean language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid; v_current_updated_at timestamptz;
begin
  if p_subscription_code is null or p_cancelled is null then return false; end if;
  select org_id,updated_at into v_org,v_current_updated_at from public.subscriptions
    where paystack_subscription_code=p_subscription_code for update;
  if v_org is null then return false; end if;
  if p_expected_updated_at is not null and v_current_updated_at is distinct from p_expected_updated_at then return false; end if;
  if not p_cancelled and exists(select 1 from public.payments where org_id=v_org and kind='subscription' and status='pending') then
    return false;
  end if;
  update public.subscriptions set cancel_at_period_end=p_cancelled,updated_at=clock_timestamp() where org_id=v_org;
  return found;
end $$;

-- Home-location requests are private rows; only the member and their admin can see coordinates.
create or replace function public.request_home_location(p_lat float8, p_lng float8, p_accuracy float8)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_member public.members%rowtype;
begin
  if p_lat is null or p_lat not between -90 and 90 or p_lng is null or p_lng not between -180 and 180 then raise exception 'GPS coordinates are invalid.'; end if;
  if p_accuracy is null or p_accuracy < 0 or p_accuracy > 100 then raise exception 'GPS accuracy is too low (±%m). Go outside or near a window and try again.', round(coalesce(p_accuracy,9999)); end if;
  select * into v_member from public.members where user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Your account is not active yet.'; end if;
  insert into public.member_private_locations(member_id,org_id,home_req_lat,home_req_lng,home_req_acc,home_req_at)
    values (v_member.id,v_member.org_id,p_lat,p_lng,p_accuracy,now())
  on conflict (member_id) do update set home_req_lat=excluded.home_req_lat,home_req_lng=excluded.home_req_lng,
    home_req_acc=excluded.home_req_acc,home_req_at=excluded.home_req_at;
  update public.members set home_status='pending' where id=v_member.id;
end $$;

create or replace function public.review_home_location(p_member uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_private public.member_private_locations%rowtype;
begin
  if not public.is_org_admin() then raise exception 'Only admins can approve home locations.'; end if;
  select * into v_private from public.member_private_locations
   where member_id=p_member and org_id=public.my_org_id() and home_req_lat is not null for update;
  if not found then raise exception 'No pending home location for this person.'; end if;
  if p_approve then
    update public.member_private_locations set home_lat=home_req_lat,home_lng=home_req_lng,
      home_req_lat=null,home_req_lng=null,home_req_acc=null,home_req_at=null where member_id=p_member;
    update public.members set home_status='approved' where id=p_member and org_id=public.my_org_id();
  else
    update public.member_private_locations set home_req_lat=null,home_req_lng=null,home_req_acc=null,home_req_at=null where member_id=p_member;
    update public.members set home_status=case when exists (select 1 from public.member_private_locations where member_id=p_member and home_lat is not null) then 'approved' else 'rejected' end
      where id=p_member and org_id=public.my_org_id();
  end if;
end $$;

-- Safe schedule lookup and attendance state: check-outs can close a session started the prior day.
create or replace function public.check_in(p_kind text, p_lat float8, p_lng float8, p_accuracy float8, p_user_agent text default null)
returns public.attendance language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare m public.members%rowtype; o public.organizations%rowtype; s public.subscriptions%rowtype;
  h public.member_private_locations%rowtype; r public.attendance%rowtype; v_open public.attendance%rowtype;
  v_at timestamptz; v_local timestamp; v_date date; v_dow int; v_mode text; v_last_kind text;
  v_loc_id uuid; v_loc_dist float8; v_loc_radius int; v_home_dist float8;
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
  -- Pick any office whose own radius contains the reading, then choose the nearest such office.
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
  if v_type='none' then
    v_dist := least(coalesce(v_loc_dist,'infinity'::float8),coalesce(v_home_dist,'infinity'::float8));
    if v_dist='infinity'::float8 then v_dist:=null; end if;
  end if;

  if p_accuracy > 100 then v_flags:=array_append(v_flags,'low_accuracy'); end if;
  if v_mode='off' then v_flags:=array_append(v_flags,'off_day');
  elsif v_type='none' then v_flags:=array_append(v_flags,'out_of_range');
  elsif v_type<>v_mode then v_flags:=array_append(v_flags,'wrong_location'); end if;
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

-- Latest state per person powers the dashboard without loading the full attendance history.
create or replace view public.member_latest_attendance with (security_invoker = true) as
select distinct on (a.org_id,a.member_id)
  a.org_id,a.member_id,a.kind,a.at,a.local_date,a.location_type,a.location_id,a.flags,a.expected_mode
from public.attendance a
order by a.org_id,a.member_id,a.at desc;
grant select on public.member_latest_attendance to authenticated;

-- The project is supported by production PostgreSQL with pg_temp explicitly last so an
-- attacker-controlled temporary relation cannot shadow a security-definer function's tables.
alter function public.my_org_id() set search_path = pg_catalog, public, pg_temp;
alter function public.my_role() set search_path = pg_catalog, public, pg_temp;
alter function public.is_org_admin() set search_path = pg_catalog, public, pg_temp;
alter function public.is_org_viewer() set search_path = pg_catalog, public, pg_temp;
alter function public.join_organization() set search_path = pg_catalog, public, pg_temp;
alter function public.create_organization(text) set search_path = pg_catalog, public, pg_temp;
alter function public.guard_member_changes() set search_path = pg_catalog, public, pg_temp;
alter function public.enforce_location_plan() set search_path = pg_catalog, public, pg_temp;

revoke execute on function public.invite_members_bulk(jsonb) from public, anon;
revoke execute on function public.replace_schedule(uuid,uuid,jsonb) from public, anon;
revoke execute on function public.invite_member(text,text,text,text) from public, anon;
revoke execute on function public.request_home_location(float8,float8,float8) from public, anon;
revoke execute on function public.review_home_location(uuid,boolean) from public, anon;
revoke execute on function public.check_in(text,float8,float8,float8,text) from public, anon;
revoke execute on function public.join_organization() from public, anon;
revoke execute on function public.create_organization(text) from public, anon;
revoke execute on function public.apply_paystack_payment(text,text,bigint,text,text,text,text,text) from public, anon, authenticated;
revoke execute on function public.record_paystack_subscription(text,text,text,text) from public, anon, authenticated;
revoke execute on function public.mark_paystack_invoice_failed(text,timestamptz) from public, anon, authenticated;
revoke execute on function public.release_missing_paystack_checkout(text) from public, anon, authenticated;
revoke execute on function public.set_paystack_subscription_cancelled(text,boolean,timestamptz) from public, anon, authenticated;
revoke execute on function public.prepare_paystack_subscription(text,text,integer,integer) from public, anon;
revoke execute on function public.prepare_paystack_seat_increase(text,integer) from public, anon;
grant execute on function public.invite_member(text,text,text,text) to authenticated;
grant execute on function public.invite_members_bulk(jsonb) to authenticated;
grant execute on function public.replace_schedule(uuid,uuid,jsonb) to authenticated;
grant execute on function public.request_home_location(float8,float8,float8) to authenticated;
grant execute on function public.review_home_location(uuid,boolean) to authenticated;
grant execute on function public.check_in(text,float8,float8,float8,text) to authenticated;
grant execute on function public.join_organization() to authenticated;
grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.apply_paystack_payment(text,text,bigint,text,text,text,text,text) to service_role;
grant execute on function public.record_paystack_subscription(text,text,text,text) to service_role;
grant execute on function public.mark_paystack_invoice_failed(text,timestamptz) to service_role;
grant execute on function public.release_missing_paystack_checkout(text) to service_role;
grant execute on function public.set_paystack_subscription_cancelled(text,boolean,timestamptz) to service_role;
grant execute on function public.prepare_paystack_subscription(text,text,integer,integer) to authenticated;
grant execute on function public.prepare_paystack_seat_increase(text,integer) to authenticated;
grant all on public.payments to service_role;

commit;
