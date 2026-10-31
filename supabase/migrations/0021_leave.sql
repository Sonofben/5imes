-- 0021 · Leave management, plus the staff details it needs (start date; birthday kept privately)
--
-- Rules agreed with the owner (October 2026):
--  * Leave types per company. Built in: Annual 20, Sick 10, Casual 5, Maternity 84 (calendar days),
--    Paternity 10, Compassionate 5, Unpaid (no limit). Admins change days, switch types off and
--    (Pro, Premium, trial) add their own, set paid/unpaid, documents, approval and carry-over.
--  * Allowances without one-by-one work: the type's company default; group rules by team, role or
--    years of service (highest matching rule wins); bulk set for many people; spreadsheet import;
--    one-person overrides for exceptions. New joiners get a share of the year (can be switched off).
--  * Carry-over per type: none (default), up to N days, or all; optionally carried days must be used
--    within N months of the new leave year.
--  * Leave year: calendar year, a financial year starting in any month, or each person's anniversary.
--  * Requests count only the person's working days (their schedule, minus holidays) unless the type
--    counts every calendar day (maternity). The line manager approves, or an admin when there is none.
--  * A day on approved leave is never absent or late, and there is no automatic check-in.

-- ── shared helper: Pro features (Pro, Premium or a live trial)
create or replace function public.org_has_pro(p_org uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select coalesce(public.org_plan_now(p_org) in ('trial','pro','premium'), false)
$$;
revoke all on function public.org_has_pro(uuid) from public, anon;
grant execute on function public.org_has_pro(uuid) to authenticated, service_role;

-- ── staff details
alter table public.members add column if not exists start_date date;
alter table public.members add column if not exists avatar_url text;
-- Birthdays are personal data: only the person and their company's admins can read them.
create table if not exists public.member_private_details (
  member_id          uuid primary key references public.members on delete cascade,
  org_id             uuid not null references public.organizations on delete cascade,
  birth_month        smallint check (birth_month between 1 and 12),
  birth_day          smallint check (birth_day between 1 and 31),
  celebrate_opt_out  boolean not null default false,
  updated_at         timestamptz not null default now(),
  check ((birth_month is null) = (birth_day is null))
);
alter table public.member_private_details enable row level security;
drop policy if exists member_private_details_read on public.member_private_details;
create policy member_private_details_read on public.member_private_details for select
  using (member_id = public.my_member_id() or (org_id = public.my_org_id() and public.is_org_admin()));
revoke all on public.member_private_details from anon;
revoke insert, update, delete on public.member_private_details from authenticated;
grant select on public.member_private_details to authenticated;

create or replace function public.valid_birthday(p_month integer, p_day integer)
returns boolean language sql immutable set search_path = pg_catalog, public, pg_temp as $$
  select (p_month is null and p_day is null)
      or (p_month between 1 and 12 and p_day between 1 and
          case when p_month = 2 then 29 when p_month in (4,6,9,11) then 30 else 31 end)
$$;

-- Admins: many people at once. Rows: [{member_id, start_date?, birth_month?, birth_day?}]. Missing keys are left alone.
create or replace function public.admin_set_staff_details(p_rows jsonb)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare r jsonb; v_org uuid := public.my_org_id(); v_id uuid; v_n integer := 0; v_m integer; v_d integer;
begin
  if auth.uid() is null or v_org is null or not public.is_org_admin() then raise exception 'Only this company''s admins can change staff details.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then raise exception 'Send up to 1,000 people at a time.'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_id := (r ->> 'member_id')::uuid;
    if not exists (select 1 from public.members where id = v_id and org_id = v_org) then raise exception 'One of these people isn''t in your company.'; end if;
    if r ? 'start_date' then
      if (r ->> 'start_date') is not null and ((r ->> 'start_date')::date > current_date + 366 or (r ->> 'start_date')::date < date '1950-01-01') then
        raise exception 'A start date is out of range: %', r ->> 'start_date'; end if;
      update public.members set start_date = (r ->> 'start_date')::date where id = v_id;
    end if;
    if r ? 'birth_month' or r ? 'birth_day' then
      v_m := (r ->> 'birth_month')::integer; v_d := (r ->> 'birth_day')::integer;
      if not public.valid_birthday(v_m, v_d) then raise exception 'A birthday is not a real date (month %, day %).', v_m, v_d; end if;
      insert into public.member_private_details (member_id, org_id, birth_month, birth_day, updated_at)
      values (v_id, v_org, v_m, v_d, now())
      on conflict (member_id) do update set birth_month = excluded.birth_month, birth_day = excluded.birth_day, updated_at = now();
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.admin_set_staff_details(jsonb) from public, anon;
grant execute on function public.admin_set_staff_details(jsonb) to authenticated;

-- Everyone: their own birthday and whether it is announced.
create or replace function public.set_my_birthday(p_month integer, p_day integer, p_opt_out boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_me uuid := public.my_member_id();
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  if not public.valid_birthday(p_month, p_day) then raise exception 'That isn''t a real date.'; end if;
  insert into public.member_private_details (member_id, org_id, birth_month, birth_day, celebrate_opt_out, updated_at)
  values (v_me, public.my_org_id(), p_month, p_day, coalesce(p_opt_out, false), now())
  on conflict (member_id) do update set birth_month = excluded.birth_month, birth_day = excluded.birth_day,
    celebrate_opt_out = excluded.celebrate_opt_out, updated_at = now();
end $$;
revoke all on function public.set_my_birthday(integer, integer, boolean) from public, anon;
grant execute on function public.set_my_birthday(integer, integer, boolean) to authenticated;

-- ── leave settings on the company
alter table public.organizations add column if not exists leave_year_mode text not null default 'calendar'
  check (leave_year_mode in ('calendar','financial','anniversary'));
alter table public.organizations add column if not exists leave_year_start_month smallint not null default 1
  check (leave_year_start_month between 1 and 12);
alter table public.organizations add column if not exists leave_prorate boolean not null default true;

create or replace function public.admin_leave_settings(p_mode text, p_start_month integer, p_prorate boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if auth.uid() is null or not public.is_org_admin() then raise exception 'Only this company''s admins can change leave settings.'; end if;
  if p_mode not in ('calendar','financial','anniversary') or p_start_month not between 1 and 12 then raise exception 'Choose a leave year.'; end if;
  update public.organizations set leave_year_mode = p_mode, leave_year_start_month = case when p_mode = 'financial' then p_start_month else 1 end,
         leave_prorate = coalesce(p_prorate, true)
   where id = public.my_org_id();
end $$;
revoke all on function public.admin_leave_settings(text, integer, boolean) from public, anon;
grant execute on function public.admin_leave_settings(text, integer, boolean) to authenticated;

-- ── leave types
create table if not exists public.leave_types (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations on delete cascade,
  code                text check (code in ('annual','sick','casual','maternity','paternity','compassionate','unpaid')),
  name                text not null check (char_length(name) between 2 and 60),
  paid                boolean not null default true,
  default_days        numeric(5,1) check (default_days is null or default_days between 0 and 366),  -- null: no limit
  counts_weekends     boolean not null default false,
  needs_approval      boolean not null default true,
  document_after_days integer check (document_after_days is null or document_after_days between 0 and 366),
  carry_mode          text not null default 'none' check (carry_mode in ('none','limited','all')),
  carry_max           numeric(5,1) check (carry_max is null or carry_max between 0 and 366),
  carry_expiry_months smallint check (carry_expiry_months is null or carry_expiry_months between 1 and 12),
  active              boolean not null default true,
  sort                integer not null default 100,
  created_at          timestamptz not null default now(),
  unique (org_id, code)
);
create unique index if not exists leave_types_name_idx on public.leave_types (org_id, lower(name));
alter table public.leave_types enable row level security;
drop policy if exists leave_types_read on public.leave_types;
create policy leave_types_read on public.leave_types for select using (org_id = public.my_org_id());
revoke all on public.leave_types from anon;
revoke insert, update, delete on public.leave_types from authenticated;
grant select on public.leave_types to authenticated;

create or replace function public.seed_leave_types(p_org uuid)
returns void language sql security definer set search_path = pg_catalog, public, pg_temp as $$
  insert into public.leave_types (org_id, code, name, paid, default_days, counts_weekends, document_after_days, sort) values
    (p_org, 'annual', 'Annual leave', true, 20, false, null, 10),
    (p_org, 'sick', 'Sick leave', true, 10, false, 2, 20),
    (p_org, 'casual', 'Casual leave', true, 5, false, null, 30),
    (p_org, 'maternity', 'Maternity leave', true, 84, true, 0, 40),
    (p_org, 'paternity', 'Paternity leave', true, 10, false, null, 50),
    (p_org, 'compassionate', 'Compassionate leave', true, 5, false, null, 60),
    (p_org, 'unpaid', 'Unpaid leave', false, null, false, null, 70)
  on conflict (org_id, code) do nothing
$$;
revoke all on function public.seed_leave_types(uuid) from public, anon, authenticated;
select public.seed_leave_types(id) from public.organizations;

create or replace function public.seed_leave_types_trigger()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.seed_leave_types(new.id);
  return new;
end $$;
drop trigger if exists organizations_seed_leave on public.organizations;
create trigger organizations_seed_leave after insert on public.organizations
  for each row execute function public.seed_leave_types_trigger();

-- Create or change a leave type. Basic: only the days and on/off of the built-in types.
create or replace function public.admin_save_leave_type(p_id uuid, p_name text, p_paid boolean, p_default_days numeric,
  p_counts_weekends boolean, p_needs_approval boolean, p_document_after_days integer,
  p_carry_mode text, p_carry_max numeric, p_carry_expiry_months integer, p_active boolean)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_id uuid; v_pro boolean;
begin
  if auth.uid() is null or v_org is null or not public.is_org_admin() then raise exception 'Only this company''s admins can change leave types.'; end if;
  v_pro := public.org_has_pro(v_org);
  if p_default_days is not null and (p_default_days < 0 or p_default_days > 366) then raise exception 'Days must be between 0 and 366.'; end if;
  if not v_pro then
    if p_id is null then raise exception 'Adding your own leave types is part of the Pro and Premium plans.'; end if;
    update public.leave_types set default_days = p_default_days, active = coalesce(p_active, true)
     where id = p_id and org_id = v_org and code is not null returning id into v_id;
    if v_id is null then raise exception 'On Basic you can change the built-in leave types only.'; end if;
    return v_id;
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 60 then raise exception 'Give the leave type a name (2 to 60 characters).'; end if;
  if coalesce(p_carry_mode, 'none') not in ('none','limited','all') then raise exception 'Choose how unused days carry over.'; end if;
  if p_carry_mode = 'limited' and (p_carry_max is null or p_carry_max <= 0) then raise exception 'Say how many days can carry over.'; end if;
  if p_id is null then
    insert into public.leave_types (org_id, name, paid, default_days, counts_weekends, needs_approval, document_after_days,
                                    carry_mode, carry_max, carry_expiry_months, active, sort)
    values (v_org, trim(p_name), coalesce(p_paid, true), p_default_days, coalesce(p_counts_weekends, false), coalesce(p_needs_approval, true),
            p_document_after_days, coalesce(p_carry_mode, 'none'), case when p_carry_mode = 'limited' then p_carry_max end,
            case when p_carry_mode <> 'none' then p_carry_expiry_months end, coalesce(p_active, true), 200)
    returning id into v_id;
  else
    update public.leave_types set name = trim(p_name), paid = coalesce(p_paid, true), default_days = p_default_days,
           counts_weekends = coalesce(p_counts_weekends, false), needs_approval = coalesce(p_needs_approval, true),
           document_after_days = p_document_after_days, carry_mode = coalesce(p_carry_mode, 'none'),
           carry_max = case when p_carry_mode = 'limited' then p_carry_max end,
           carry_expiry_months = case when p_carry_mode <> 'none' then p_carry_expiry_months end, active = coalesce(p_active, true)
     where id = p_id and org_id = v_org returning id into v_id;
    if v_id is null then raise exception 'That leave type isn''t in your company.'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'You already have a leave type with that name.';
end $$;
revoke all on function public.admin_save_leave_type(uuid, text, boolean, numeric, boolean, boolean, integer, text, numeric, integer, boolean) from public, anon;
grant execute on function public.admin_save_leave_type(uuid, text, boolean, numeric, boolean, boolean, integer, text, numeric, integer, boolean) to authenticated;

-- ── group rules (Pro): by team, role and/or years of service. The highest matching rule wins.
create table if not exists public.leave_rules (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations on delete cascade,
  leave_type_id uuid not null references public.leave_types on delete cascade,
  team          text check (team is null or char_length(team) between 1 and 60),
  role          text check (role is null or role in ('staff','manager','admin','owner')),
  min_years     numeric(4,1) check (min_years is null or min_years between 0 and 60),
  days          numeric(5,1) not null check (days between 0 and 366),
  created_at    timestamptz not null default now()
);
alter table public.leave_rules enable row level security;
drop policy if exists leave_rules_read on public.leave_rules;
create policy leave_rules_read on public.leave_rules for select using (org_id = public.my_org_id() and public.is_org_admin());
revoke all on public.leave_rules from anon;
revoke insert, update, delete on public.leave_rules from authenticated;
grant select on public.leave_rules to authenticated;

create or replace function public.admin_save_leave_rule(p_type uuid, p_team text, p_role text, p_min_years numeric, p_days numeric)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_id uuid;
begin
  if auth.uid() is null or not public.is_org_admin() then raise exception 'Only this company''s admins can set leave rules.'; end if;
  if not public.org_has_pro(v_org) then raise exception 'Leave rules by team, role and years of service are part of Pro and Premium.'; end if;
  if not exists (select 1 from public.leave_types where id = p_type and org_id = v_org) then raise exception 'Choose a leave type.'; end if;
  if nullif(trim(p_team), '') is null and p_role is null and p_min_years is null then raise exception 'Choose a team, a role or years of service for the rule.'; end if;
  insert into public.leave_rules (org_id, leave_type_id, team, role, min_years, days)
  values (v_org, p_type, nullif(trim(p_team), ''), p_role, p_min_years, p_days) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.admin_save_leave_rule(uuid, text, text, numeric, numeric) from public, anon;
grant execute on function public.admin_save_leave_rule(uuid, text, text, numeric, numeric) to authenticated;

create or replace function public.admin_remove_leave_rule(p_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if auth.uid() is null or not public.is_org_admin() then raise exception 'Only this company''s admins can remove leave rules.'; end if;
  delete from public.leave_rules where id = p_id and org_id = public.my_org_id();
end $$;
revoke all on function public.admin_remove_leave_rule(uuid) from public, anon;
grant execute on function public.admin_remove_leave_rule(uuid) to authenticated;

-- ── one-person allowances for a leave year (exceptions, bulk edits and imports)
create table if not exists public.leave_allowances (
  member_id     uuid not null references public.members on delete cascade,
  leave_type_id uuid not null references public.leave_types on delete cascade,
  year_start    date not null,
  org_id        uuid not null references public.organizations on delete cascade,
  days          numeric(5,1) not null check (days between 0 and 366),
  note          text check (note is null or char_length(note) <= 200),
  updated_by    uuid references public.members on delete set null,
  updated_at    timestamptz not null default now(),
  primary key (member_id, leave_type_id, year_start)
);
alter table public.leave_allowances enable row level security;
drop policy if exists leave_allowances_read on public.leave_allowances;
create policy leave_allowances_read on public.leave_allowances for select
  using (member_id = public.my_member_id() or (org_id = public.my_org_id() and public.is_org_admin()));
revoke all on public.leave_allowances from anon;
revoke insert, update, delete on public.leave_allowances from authenticated;
grant select on public.leave_allowances to authenticated;

-- ── requests
create table if not exists public.leave_requests (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations on delete cascade,
  member_id     uuid not null references public.members on delete cascade,
  leave_type_id uuid not null references public.leave_types on delete restrict,
  start_date    date not null,
  end_date      date not null,
  days          numeric(5,1) not null check (days > 0),
  reason        text check (reason is null or char_length(reason) <= 500),
  document_path text check (document_path is null or char_length(document_path) <= 300),
  status        text not null default 'pending' check (status in ('pending','approved','declined','cancelled')),
  approver_id   uuid references public.members on delete set null,   -- line manager at request time; null: admins
  decided_by    uuid references public.members on delete set null,
  decided_at    timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  created_at    timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists leave_requests_member_idx on public.leave_requests (member_id, start_date);
create index if not exists leave_requests_org_idx on public.leave_requests (org_id, status, start_date);
alter table public.leave_requests enable row level security;
drop policy if exists leave_requests_read on public.leave_requests;
create policy leave_requests_read on public.leave_requests for select using (
  member_id = public.my_member_id()
  or (org_id = public.my_org_id() and (public.is_org_admin() or approver_id = public.my_member_id()
      or exists (select 1 from public.members m where m.id = leave_requests.member_id and m.line_manager_id = public.my_member_id()))));
revoke all on public.leave_requests from anon;
revoke insert, update, delete on public.leave_requests from authenticated;
grant select on public.leave_requests to authenticated;

-- ── calculations
-- First day of the leave year that contains p_date for this person.
create or replace function public.leave_year_start(p_member uuid, p_date date)
returns date language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare o public.organizations%rowtype; m public.members%rowtype; v_y integer; v_s date; v_n integer;
begin
  select * into m from public.members where id = p_member;
  select * into o from public.organizations where id = m.org_id;
  v_y := extract(year from p_date);
  if o.leave_year_mode = 'financial' then
    v_s := make_date(v_y, o.leave_year_start_month, 1);
    if v_s > p_date then v_s := make_date(v_y - 1, o.leave_year_start_month, 1); end if;
    return v_s;
  elsif o.leave_year_mode = 'anniversary' and m.start_date is not null and m.start_date <= p_date then
    v_n := extract(year from age(p_date, m.start_date));
    return (m.start_date + make_interval(years => v_n))::date;
  end if;
  return make_date(v_y, 1, 1);
end $$;
revoke all on function public.leave_year_start(uuid, date) from public, anon, authenticated;

-- The days a leave request uses: working days on the person's schedule, minus holidays,
-- or every calendar day for types like maternity leave.
create or replace function public.leave_days(p_member uuid, p_type uuid, p_start date, p_end date)
returns numeric language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select case when t.counts_weekends then (p_end - p_start + 1)::numeric
         else (select count(*)::numeric from generate_series(p_start, p_end, interval '1 day') d
                where public.scheduled_mode(p_member, d::date) <> 'off'
                  and public.holiday_name(t.org_id, d::date) is null) end
    from public.leave_types t where t.id = p_type
$$;
revoke all on function public.leave_days(uuid, uuid, date, date) from public, anon;
grant execute on function public.leave_days(uuid, uuid, date, date) to authenticated;

-- How many days of this type the person gets in the leave year starting p_year_start (no carry-over).
-- Null means no limit.
create or replace function public.leave_entitlement(p_member uuid, p_type uuid, p_year_start date)
returns numeric language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare m public.members%rowtype; t public.leave_types%rowtype; o public.organizations%rowtype;
        v_days numeric; v_rule numeric; v_years numeric; v_end date;
begin
  select * into m from public.members where id = p_member;
  select * into t from public.leave_types where id = p_type and org_id = m.org_id;
  if not found then return 0; end if;
  select * into o from public.organizations where id = m.org_id;
  select days into v_days from public.leave_allowances where member_id = m.id and leave_type_id = t.id and year_start = p_year_start;
  if found then return v_days; end if;
  if t.default_days is null then return null; end if;
  v_days := t.default_days;
  if public.org_has_pro(m.org_id) then
    v_years := case when m.start_date is null then 0 else extract(epoch from age(greatest(p_year_start, current_date), m.start_date)) / 31557600 end;
    select max(r.days) into v_rule from public.leave_rules r
     where r.leave_type_id = t.id
       and (r.team is null or lower(r.team) = lower(coalesce(m.team, '')))
       and (r.role is null or r.role = m.role)
       and (r.min_years is null or v_years >= r.min_years);
    if v_rule is not null then v_days := v_rule; end if;
  end if;
  -- Joined during this leave year: a share of the year.
  v_end := (p_year_start + interval '1 year')::date;
  if o.leave_prorate and m.start_date is not null and m.start_date > p_year_start and m.start_date < v_end and not t.counts_weekends then
    v_days := round(v_days * (v_end - m.start_date)::numeric / (v_end - p_year_start) * 2) / 2;
  end if;
  return v_days;
end $$;
revoke all on function public.leave_entitlement(uuid, uuid, date) from public, anon, authenticated;

create or replace function public.leave_used(p_member uuid, p_type uuid, p_year_start date, p_status text, p_before date default null)
returns numeric language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select coalesce(sum(days), 0) from public.leave_requests
   where member_id = p_member and leave_type_id = p_type and status = p_status
     and start_date >= p_year_start and start_date < (p_year_start + interval '1 year')::date
     and (p_before is null or start_date < p_before)
$$;
revoke all on function public.leave_used(uuid, uuid, date, text, date) from public, anon, authenticated;

-- Everything about one person's leave of one type this year.
create or replace function public.leave_balance(p_member uuid, p_type uuid, p_on date default current_date)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare t public.leave_types%rowtype; m public.members%rowtype; v_ys date; v_prev date; v_ent numeric; v_prev_ent numeric;
        v_carried numeric := 0; v_expires date; v_used numeric; v_pending numeric;
begin
  select * into m from public.members where id = p_member;
  select * into t from public.leave_types where id = p_type and org_id = m.org_id;
  v_ys := public.leave_year_start(p_member, p_on);
  v_ent := public.leave_entitlement(p_member, p_type, v_ys);
  if t.carry_mode <> 'none' and v_ent is not null and public.org_has_pro(m.org_id) then
    v_prev := (v_ys - interval '1 year')::date;
    if m.start_date is null or m.start_date < v_ys then
      v_prev_ent := public.leave_entitlement(p_member, p_type, v_prev);
      v_carried := greatest(coalesce(v_prev_ent, 0) - public.leave_used(p_member, p_type, v_prev, 'approved'), 0);
      if t.carry_mode = 'limited' then v_carried := least(v_carried, coalesce(t.carry_max, 0)); end if;
      if t.carry_expiry_months is not null then
        v_expires := (v_ys + make_interval(months => t.carry_expiry_months))::date;
        if p_on >= v_expires then
          v_carried := least(v_carried, public.leave_used(p_member, p_type, v_ys, 'approved', v_expires));
        end if;
      end if;
    end if;
  end if;
  v_used := public.leave_used(p_member, p_type, v_ys, 'approved');
  v_pending := public.leave_used(p_member, p_type, v_ys, 'pending');
  return jsonb_build_object('type_id', t.id, 'name', t.name, 'paid', t.paid, 'year_start', v_ys,
    'entitlement', v_ent, 'carried', v_carried, 'carried_expires', v_expires, 'used', v_used, 'pending', v_pending,
    'remaining', case when v_ent is null then null else v_ent + v_carried - v_used - v_pending end);
end $$;
revoke all on function public.leave_balance(uuid, uuid, date) from public, anon, authenticated;

-- The signed-in person's balances, for every leave type their company has switched on.
create or replace function public.my_leave_balances()
returns jsonb language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select coalesce(jsonb_agg(public.leave_balance(public.my_member_id(), t.id) order by t.sort, t.name), '[]'::jsonb)
    from public.leave_types t
   where t.org_id = public.my_org_id() and t.active and (t.code is not null or public.org_has_pro(t.org_id))
$$;
revoke all on function public.my_leave_balances() from public, anon;
grant execute on function public.my_leave_balances() to authenticated;

-- Admins: every active person's balance of one type.
create or replace function public.admin_leave_overview(p_type uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id();
begin
  if auth.uid() is null or not public.is_org_admin() then raise exception 'Only admins can see everyone''s leave.'; end if;
  if not exists (select 1 from public.leave_types where id = p_type and org_id = v_org) then raise exception 'Choose a leave type.'; end if;
  return coalesce((select jsonb_agg(public.leave_balance(m.id, p_type)
                     || jsonb_build_object('member_id', m.id, 'member', coalesce(m.full_name, m.email), 'team', m.team,
                          'override', exists (select 1 from public.leave_allowances a where a.member_id = m.id and a.leave_type_id = p_type
                                                and a.year_start = public.leave_year_start(m.id, current_date)))
                     order by coalesce(m.full_name, m.email))
                    from public.members m where m.org_id = v_org and m.status = 'active'), '[]'::jsonb);
end $$;
revoke all on function public.admin_leave_overview(uuid) from public, anon;
grant execute on function public.admin_leave_overview(uuid) to authenticated;

-- Admins (Pro): set this leave year's allowance for many people. Rows: [{member_id, leave_type_id, days|null}];
-- null days removes the override so the person goes back to the default and rules.
create or replace function public.admin_set_allowances(p_rows jsonb, p_note text default null)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare r jsonb; v_org uuid := public.my_org_id(); v_member uuid; v_type uuid; v_ys date; v_n integer := 0;
begin
  if auth.uid() is null or v_org is null or not public.is_org_admin() then raise exception 'Only this company''s admins can set allowances.'; end if;
  if not public.org_has_pro(v_org) then raise exception 'Setting allowances per person is part of Pro and Premium. On Basic, change the company default for the leave type.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then raise exception 'Send up to 2,000 rows at a time.'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_member := (r ->> 'member_id')::uuid; v_type := (r ->> 'leave_type_id')::uuid;
    if not exists (select 1 from public.members where id = v_member and org_id = v_org) then raise exception 'One of these people isn''t in your company.'; end if;
    if not exists (select 1 from public.leave_types where id = v_type and org_id = v_org) then raise exception 'One of these leave types isn''t in your company.'; end if;
    v_ys := public.leave_year_start(v_member, current_date);
    if r ->> 'days' is null then
      delete from public.leave_allowances where member_id = v_member and leave_type_id = v_type and year_start = v_ys;
    else
      if (r ->> 'days')::numeric not between 0 and 366 then raise exception 'Days must be between 0 and 366.'; end if;
      insert into public.leave_allowances (member_id, leave_type_id, year_start, org_id, days, note, updated_by, updated_at)
      values (v_member, v_type, v_ys, v_org, (r ->> 'days')::numeric, nullif(left(trim(coalesce(p_note, '')), 200), ''), public.my_member_id(), now())
      on conflict (member_id, leave_type_id, year_start) do update set days = excluded.days, note = excluded.note,
        updated_by = excluded.updated_by, updated_at = now();
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.admin_set_allowances(jsonb, text) from public, anon;
grant execute on function public.admin_set_allowances(jsonb, text) to authenticated;

-- ── asking for leave
create or replace function public.request_leave(p_type uuid, p_start date, p_end date, p_reason text, p_document text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare m public.members%rowtype; t public.leave_types%rowtype; v_days numeric; v_bal jsonb; v_id uuid; v_status text;
        v_approver uuid;
begin
  select * into m from public.members where user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Your account is not active yet.'; end if;
  perform public.rate_limit_hit('leave_request', 'm:' || m.id, 30, interval '1 hour');
  select * into t from public.leave_types where id = p_type and org_id = m.org_id and active;
  if not found or (t.code is null and not public.org_has_pro(m.org_id)) then raise exception 'Choose a leave type.'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'Choose a start and an end date.'; end if;
  if p_end - p_start > 365 then raise exception 'A single request can be up to one year.'; end if;
  if p_start < current_date - 60 then raise exception 'Leave can be recorded up to 60 days back.'; end if;
  if public.leave_year_start(m.id, p_start) <> public.leave_year_start(m.id, p_end) then
    raise exception 'This leave crosses into the next leave year. Send one request for each year.'; end if;
  v_days := public.leave_days(m.id, t.id, p_start, p_end);
  if v_days <= 0 then raise exception 'Those dates are all days off or holidays, so there is nothing to take.'; end if;
  if exists (select 1 from public.leave_requests where member_id = m.id and status in ('pending','approved')
               and daterange(start_date, end_date, '[]') && daterange(p_start, p_end, '[]')) then
    raise exception 'You already have leave on some of these dates.'; end if;
  v_bal := public.leave_balance(m.id, t.id, p_start);
  if (v_bal ->> 'remaining') is not null and v_days > (v_bal ->> 'remaining')::numeric then
    raise exception 'This needs % days of % but you have % left.', v_days, t.name, v_bal ->> 'remaining'; end if;
  if t.document_after_days is not null and v_days > t.document_after_days and public.org_has_pro(m.org_id) and p_document is null then
    raise exception 'Please attach a document (for example a doctor''s note) for % longer than % days.', lower(t.name), t.document_after_days; end if;
  if p_document is not null and position((m.org_id::text || '/' || m.id::text || '/') in p_document) <> 1 then
    raise exception 'That document is not yours.'; end if;
  select id into v_approver from public.members where id = m.line_manager_id and status = 'active';
  v_status := case when t.needs_approval then 'pending' else 'approved' end;
  insert into public.leave_requests (org_id, member_id, leave_type_id, start_date, end_date, days, reason, document_path, status, approver_id,
                                     decided_at)
  values (m.org_id, m.id, t.id, p_start, p_end, v_days, nullif(left(trim(coalesce(p_reason, '')), 500), ''), p_document, v_status, v_approver,
          case when v_status = 'approved' then now() end)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.request_leave(uuid, date, date, text, text) from public, anon;
grant execute on function public.request_leave(uuid, date, date, text, text) to authenticated;

-- Approve or decline: the person's line manager, or any admin. Nobody decides their own leave
-- (except the company owner, who has no one above them).
create or replace function public.decide_leave(p_id uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare r public.leave_requests%rowtype; v_me uuid := public.my_member_id(); v_lm uuid;
begin
  select * into r from public.leave_requests where id = p_id and org_id = public.my_org_id() for update;
  if not found then raise exception 'That leave request was not found.'; end if;
  if r.status <> 'pending' then raise exception 'This request has already been decided.'; end if;
  select line_manager_id into v_lm from public.members where id = r.member_id;
  if not (public.is_org_admin() or r.approver_id = v_me or v_lm = v_me) then raise exception 'Only their line manager or an admin can decide this.'; end if;
  if r.member_id = v_me and public.my_role() <> 'owner' then raise exception 'Someone else has to approve your own leave.'; end if;
  update public.leave_requests set status = case when p_approve then 'approved' else 'declined' end, decided_by = v_me, decided_at = now(),
         decision_note = nullif(left(trim(coalesce(p_note, '')), 500), '')
   where id = p_id;
end $$;
revoke all on function public.decide_leave(uuid, boolean, text) from public, anon;
grant execute on function public.decide_leave(uuid, boolean, text) to authenticated;

-- Cancel: the person (while pending, or approved leave that hasn't started) or an admin.
create or replace function public.cancel_leave(p_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare r public.leave_requests%rowtype; v_today date;
begin
  select * into r from public.leave_requests where id = p_id and org_id = public.my_org_id() for update;
  if not found then raise exception 'That leave request was not found.'; end if;
  if r.status not in ('pending','approved') then raise exception 'This request can no longer be cancelled.'; end if;
  v_today := (now() at time zone (select timezone from public.organizations where id = r.org_id))::date;
  if not public.is_org_admin() then
    if r.member_id <> public.my_member_id() then raise exception 'You can only cancel your own leave.'; end if;
    if r.status = 'approved' and r.start_date <= v_today then raise exception 'This leave has started. Ask your admin to change it.'; end if;
  end if;
  update public.leave_requests set status = 'cancelled', decided_by = public.my_member_id(), decided_at = now() where id = p_id;
end $$;
revoke all on function public.cancel_leave(uuid) from public, anon;
grant execute on function public.cancel_leave(uuid) to authenticated;

-- The leave someone is on for a date (approved), or null.
create or replace function public.on_leave(p_member uuid, p_date date)
returns text language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select t.name from public.leave_requests r join public.leave_types t on t.id = r.leave_type_id
   where r.member_id = p_member and r.status = 'approved' and p_date between r.start_date and r.end_date
   order by r.start_date limit 1
$$;
revoke all on function public.on_leave(uuid, date) from public, anon;
grant execute on function public.on_leave(uuid, date) to authenticated, service_role;

-- No automatic check-in for someone on leave.
do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.try_auto_check_in(uuid)'::regprocedure);
  v_new := replace(v_def, 'if public.holiday_name(o.id, v_date) is not null then return null; end if;',
    'if public.holiday_name(o.id, v_date) is not null then return null; end if;
  if public.on_leave(m.id, v_date) is not null then return null; end if;');
  if v_new = v_def then raise exception 'try_auto_check_in was not updated'; end if;
  execute v_new;
end $$;

-- Plan lists mention leave (added once).
update public.platform_plans set features = array_append(features, 'Leave requests and approvals (standard leave types)'), updated_at = now()
 where plan = 'basic' and not features @> array['Leave requests and approvals (standard leave types)'];
update public.platform_plans set features = array_append(features, 'Full leave management: your own leave types, rules, bulk allowances, carry-over'), updated_at = now()
 where plan = 'pro' and not features @> array['Full leave management: your own leave types, rules, bulk allowances, carry-over'];
