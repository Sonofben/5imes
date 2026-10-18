-- 5ime: Global Admin (replaces the "console" feature set; URL stays /console).
--
-- Global admin roles (platform_staff.role):
--   owner   → Global admin        (everything, incl. pricing, team, delete)
--   support → Support admin       (companies, people, security, announcements)
--   finance → Billing admin       (revenue, payments, plans/seats, complimentary terms)
--   viewer  → Read-only admin
--
-- Privacy rule kept on purpose: company and account information is always
-- visible; a company's STAFF LIST and ATTENDANCE only while that company has
-- granted support access, and every look is logged.
--
-- Apply after 0011. Safe to re-run.
begin;

-- ───────────────────────────────────────────── plans, pricing and platform settings
create table if not exists public.platform_plans (
  plan text primary key check (plan in ('basic','pro')),
  name text not null check (char_length(name) between 2 and 40),
  price_naira integer not null check (price_naira between 1 and 1000000),
  blurb text not null default '' check (char_length(blurb) <= 200),
  features text[] not null default '{}',
  max_locations integer check (max_locations is null or max_locations between 1 and 1000),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.platform_plans (plan, name, price_naira, blurb, features, max_locations) values
  ('basic', 'Basic', 250, 'For small teams with one office.',
   array['Company-email, Google & Microsoft sign-in','1 office location + approved home locations','GPS check-in / check-out (fixed 200m radius)',
         'One weekly office/home schedule for everyone','Late arrival & early exit tracking','Live “who’s in today” dashboard',
         '30 days of history, CSV export','Email support'], 1),
  ('pro', 'Pro', 500, 'For growing companies with branches.',
   array['Everything in Basic','Unlimited office locations / branches','Custom check-in radius per location','Per-person office/home schedules',
         'Manager role, with staff grouped by team','Weak-GPS flags, plus device & IP records for admins',
         'Unlimited history, attendance reporting & CSV export','Faster support by WhatsApp & email'], null)
on conflict (plan) do nothing;
alter table public.platform_plans enable row level security;
revoke all on public.platform_plans from public, anon, authenticated;
grant all on public.platform_plans to service_role;

create table if not exists public.platform_settings (
  id boolean primary key default true check (id),
  trial_days integer not null default 14 check (trial_days between 1 and 90),
  maintenance_mode boolean not null default false,
  maintenance_message text check (char_length(maintenance_message) <= 300),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.platform_settings (id) values (true) on conflict (id) do nothing;
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from public, anon, authenticated;
grant all on public.platform_settings to service_role;

create or replace function public.plan_price(p_plan text)
returns integer language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select coalesce((select price_naira from public.platform_plans where plan = p_plan), case p_plan when 'basic' then 250 else 500 end);
$$;
create or replace function public.platform_trial_days()
returns integer language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select coalesce((select trial_days from public.platform_settings where id), 14);
$$;
revoke all on function public.plan_price(text) from public;
revoke all on function public.platform_trial_days() from public;
grant execute on function public.plan_price(text) to authenticated, service_role;
grant execute on function public.platform_trial_days() to authenticated, service_role;

-- Public price list (landing page, billing page).
create or replace function public.public_plans()
returns jsonb language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select jsonb_build_object(
    'trial_days', public.platform_trial_days(),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', plan, 'name', name, 'pricePerSeat', price_naira,
               'blurb', blurb, 'features', to_jsonb(features), 'maxLocations', max_locations) order by price_naira)
             from public.platform_plans), '[]'::jsonb));
$$;
revoke all on function public.public_plans() from public;
grant execute on function public.public_plans() to anon, authenticated, service_role;

-- Re-point every function that had the prices or trial length written into it.
-- A checkout already reserved keeps the amount it was created with.
do $$
declare f record; v_def text; v_new text;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f'
             and p.proname in ('prepare_paystack_subscription','prepare_paystack_seat_increase','apply_paystack_payment','create_organization')
  loop
    v_def := pg_get_functiondef(f.oid);
    v_new := v_def;
    v_new := replace(v_new, $q$v_payment.seats * (case v_payment.plan when 'basic' then 250 else 500 end)::bigint * v_payment.billing_interval_months * 100$q$, 'v_payment.amount_kobo');
    v_new := replace(v_new, $q$case p_plan when 'basic' then 250 else 500 end$q$, 'public.plan_price(p_plan)');
    v_new := replace(v_new, $q$case v_sub.plan when 'basic' then 250 else 500 end$q$, 'public.plan_price(v_sub.plan)');
    v_new := replace(v_new, $q$case v_plan when 'basic' then 250 else 500 end$q$, 'public.plan_price(v_plan)');
    v_new := replace(v_new, $q$now() + interval '14 days'$q$, $q$now() + make_interval(days => public.platform_trial_days())$q$);
    if v_new <> v_def then execute v_new; end if;
  end loop;
end $$;

-- Plan location limit comes from the plan table.
create or replace function public.enforce_location_plan()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_plan text; v_max integer;
begin
  select plan into v_plan from public.subscriptions where org_id = new.org_id;
  select max_locations into v_max from public.platform_plans where plan = coalesce(v_plan, 'pro');
  if v_plan = 'basic' then new.radius_m := 200; end if;
  if tg_op = 'INSERT' and v_max is not null and (select count(*) from public.locations where org_id = new.org_id) >= v_max then
    raise exception 'Your % plan includes % office location%. Upgrade to add more.',
      coalesce((select name from public.platform_plans where plan = v_plan), v_plan), v_max, case when v_max = 1 then '' else 's' end;
  end if;
  if new.radius_m < 50 or new.radius_m > 2000 then
    raise exception 'Radius must be between 50m and 2000m.';
  end if;
  return new;
end $$;

-- ───────────────────────────────────────────── announcements and maintenance
create table if not exists public.platform_announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(trim(message)) between 3 and 400),
  level text not null default 'info' check (level in ('info','warning','critical')),
  org_id uuid references public.organizations on delete cascade,    -- null = every company
  audience text not null default 'everyone' check (audience in ('everyone','admins')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
alter table public.platform_announcements enable row level security;
revoke all on public.platform_announcements from public, anon, authenticated;
grant all on public.platform_announcements to service_role;

-- What a signed-in person should see right now (banner).
create or replace function public.my_announcements()
returns table (id uuid, message text, level text, maintenance boolean)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select null::uuid, coalesce(nullif(s.maintenance_message, ''), '5ime is under maintenance. Check-ins are paused for a short while.'), 'critical', true
    from public.platform_settings s where s.id and s.maintenance_mode
  union all
  select a.id, a.message, a.level, false
    from public.platform_announcements a
   where a.ended_at is null and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
     and (a.org_id is null or a.org_id = public.my_org_id())
     and (a.audience = 'everyone' or public.is_org_viewer());
$$;
revoke all on function public.my_announcements() from public, anon;
grant execute on function public.my_announcements() to authenticated;

-- Maintenance pauses new check-ins/outs made by people (automatic manager actions still work).
create or replace function public.block_attendance_in_maintenance()
returns trigger language plpgsql set search_path = pg_catalog, public, pg_temp as $$
declare v_msg text;
begin
  if 'left_unapproved' = any(new.flags) or 'corrected' = any(new.flags) then return new; end if;
  select maintenance_message into v_msg from public.platform_settings where id and maintenance_mode;
  if found then
    raise exception '%', coalesce(nullif(v_msg, ''), '5ime is under maintenance. Check-ins are paused for a short while.');
  end if;
  return new;
end $$;
drop trigger if exists attendance_block_maintenance on public.attendance;
create trigger attendance_block_maintenance before insert on public.attendance
  for each row execute function public.block_attendance_in_maintenance();

-- ───────────────────────────────────────────── company lifecycle columns
alter table public.organizations add column if not exists archived_at timestamptz;

-- ───────────────────────────────────────────── helper: log app-side actions (password reset email etc.)
create or replace function public.console_note(p_org uuid, p_action text, p_reason text, p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','finance']);
  if p_action !~ '^app\.[a-z_.]{3,60}$' then raise exception 'Invalid action name.'; end if;
  perform public.console_log(p_org, p_action, p_reason, p_details);
end $$;

-- ───────────────────────────────────────────── revenue & payments
create or replace function public.console_revenue()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','finance','viewer']);
  return jsonb_build_object(
    'this_month_kobo', (select coalesce(sum(amount_kobo),0) from payments where status='applied' and applied_at >= date_trunc('month', now())),
    'last_month_kobo', (select coalesce(sum(amount_kobo),0) from payments where status='applied'
                          and applied_at >= date_trunc('month', now()) - interval '1 month' and applied_at < date_trunc('month', now())),
    'year_kobo', (select coalesce(sum(amount_kobo),0) from payments where status='applied' and applied_at >= now() - interval '12 months'),
    'all_time_kobo', (select coalesce(sum(amount_kobo),0) from payments where status='applied'),
    -- monthly value of everything currently paid for (seats × price), the closest thing to MRR for pay-per-term
    'monthly_run_rate_kobo', (select coalesce(sum(s.seats_paid::bigint * public.plan_price(s.plan) * 100),0) from subscriptions s
                               where s.status in ('active','past_due') and s.current_period_end > now()),
    'paying_companies', (select count(*) from subscriptions where status in ('active','past_due') and current_period_end > now()),
    'pending_count', (select count(*) from payments where status='pending'),
    'failed_count_30d', (select count(*) from payments where status not in ('applied','pending') and created_at > now() - interval '30 days'),
    'by_month', coalesce((select jsonb_agg(m order by m.month) from (
        select to_char(date_trunc('month', applied_at), 'YYYY-MM') as month, sum(amount_kobo) as kobo, count(*) as payments
          from payments where status='applied' and applied_at >= date_trunc('month', now()) - interval '11 months'
         group by 1) m), '[]'::jsonb),
    'by_plan', coalesce((select jsonb_object_agg(plan, kobo) from (
        select plan, sum(amount_kobo) kobo from payments where status='applied' and applied_at >= now() - interval '12 months' group by plan) p), '{}'::jsonb),
    'by_provider', coalesce((select jsonb_object_agg(provider, kobo) from (
        select provider, sum(amount_kobo) kobo from payments where status='applied' and applied_at >= now() - interval '12 months' group by provider) p), '{}'::jsonb)
  );
end $$;

create or replace function public.console_payments(p_from date default null, p_to date default null, p_status text default null, p_search text default null)
returns table (reference text, org_id uuid, company text, domain text, provider text, kind text, status text, plan text,
               seats integer, months integer, amount_kobo bigint, created_at timestamptz, applied_at timestamptz, note text)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','finance','viewer']);
  return query
    select p.reference, p.org_id, o.name, o.domain, p.provider, p.kind, p.status, p.plan, p.seats, p.billing_interval_months,
           p.amount_kobo::bigint, p.created_at, p.applied_at, p.note
      from payments p join organizations o on o.id = p.org_id
     where (p_from is null or p.created_at >= p_from)
       and (p_to is null or p.created_at < p_to + 1)
       and (p_status is null or p_status = '' or p.status = p_status)
       and (p_search is null or trim(p_search) = '' or o.name ilike '%'||trim(p_search)||'%' or o.domain ilike '%'||trim(p_search)||'%'
            or p.reference ilike '%'||trim(p_search)||'%')
     order by p.created_at desc
     limit 2000;
end $$;

-- ───────────────────────────────────────────── platform health & usage
create or replace function public.console_health()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','finance','viewer']);
  return jsonb_build_object(
    'companies_active_7d', (select count(distinct org_id) from attendance where at > now() - interval '7 days'),
    'people_active_7d', (select count(distinct member_id) from attendance where at > now() - interval '7 days'),
    'checkins_today', (select count(*) from attendance where kind='in' and at >= date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos'),
    'checkins_by_day', coalesce((select jsonb_agg(d order by d.day) from (
        select to_char(g.day, 'YYYY-MM-DD') as day,
               (select count(*) from attendance a where a.kind='in' and (a.at at time zone 'Africa/Lagos')::date = g.day) as checkins
          from generate_series((now() at time zone 'Africa/Lagos')::date - 13, (now() at time zone 'Africa/Lagos')::date, interval '1 day') g(day)) d), '[]'::jsonb),
    'signups_by_week', coalesce((select jsonb_agg(w order by w.week) from (
        select to_char(g.week, 'YYYY-MM-DD') as week,
               (select count(*) from organizations o where o.created_at >= g.week and o.created_at < g.week + interval '7 days') as companies
          from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') g(week)) w), '[]'::jsonb),
    'at_risk', coalesce((select jsonb_agg(r) from (
        select o.id, o.name, o.domain,
          case
            when o.suspended_at is not null then 'Suspended'
            when s.status = 'trialing' and s.trial_ends_at < now() then 'Trial ended, not paid'
            when s.status = 'trialing' and s.trial_ends_at < now() + interval '3 days' then 'Trial ends within 3 days'
            when s.status in ('active','past_due') and s.current_period_end < now() then 'Paid term ended'
            when s.status in ('active','past_due') and s.current_period_end < now() + interval '7 days' then 'Term ends within 7 days'
            when not exists (select 1 from attendance a where a.org_id = o.id and a.at > now() - interval '7 days') then 'No check-ins in 7 days'
            when not exists (select 1 from locations l where l.org_id = o.id) then 'No office set up'
          end as reason,
          (select max(a.at) from attendance a where a.org_id = o.id) as last_check_in
        from organizations o left join subscriptions s on s.org_id = o.id
        where o.archived_at is null) r where r.reason is not null), '[]'::jsonb)
  );
end $$;

-- ───────────────────────────────────────────── companies list (archived hidden by default)
drop function if exists public.console_companies(text);
create or replace function public.console_companies(p_search text default null, p_archived boolean default false)
returns table (id uuid, name text, domain text, slug text, plan text, status text, trial_ends_at timestamptz,
  current_period_end timestamptz, seats_paid int, seats_used bigint, created_at timestamptz,
  suspended_at timestamptz, owner_email text, last_check_in timestamptz, support_until timestamptz, archived_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','finance','viewer']);
  return query
    select o.id, o.name, o.domain, o.slug, s.plan, s.status, s.trial_ends_at, s.current_period_end, s.seats_paid,
      (select count(*) from members m where m.org_id = o.id and m.status in ('active','invited')),
      o.created_at, o.suspended_at,
      (select m.email from members m where m.org_id = o.id and m.role = 'owner' limit 1),
      (select max(a.at) from attendance a where a.org_id = o.id),
      public.support_access_until(o.id), o.archived_at
    from organizations o left join subscriptions s on s.org_id = o.id
    where (o.archived_at is not null) = coalesce(p_archived, false)
      and (p_search is null or trim(p_search) = '' or o.name ilike '%' || trim(p_search) || '%'
        or o.domain ilike '%' || trim(p_search) || '%' or o.slug ilike '%' || trim(p_search) || '%')
    order by o.created_at desc
    limit 500;
end $$;

-- ───────────────────────────────────────────── company lifecycle
create or replace function public.console_create_company(p_name text, p_domain text, p_owner_email text, p_owner_name text,
                                                         p_trial_days integer, p_reason text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid; v_domain text := lower(trim(p_domain)); v_email text := lower(trim(p_owner_email));
begin
  perform public.console_require(array['owner','support'], p_reason, true);
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter the company name.'; end if;
  if v_domain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then raise exception 'Enter a valid email domain, e.g. acme.com.ng'; end if;
  if public.is_public_email_domain(v_domain) then raise exception 'Public email domains (Gmail, Yahoo…) cannot be a company domain.'; end if;
  if split_part(v_email, '@', 2) <> v_domain then raise exception 'The owner email must be on @%.', v_domain; end if;
  if exists (select 1 from organizations where domain = v_domain) then raise exception 'A company using @% already exists.', v_domain; end if;
  if exists (select 1 from members where lower(email) = v_email) then raise exception '% already belongs to a company.', v_email; end if;
  if p_trial_days is null or p_trial_days < 1 or p_trial_days > 90 then raise exception 'Trial must be 1 to 90 days.'; end if;

  insert into organizations (name, domain) values (trim(p_name), v_domain) returning id into v_org;
  insert into subscriptions (org_id, plan, status, trial_ends_at) values (v_org, 'pro', 'trialing', now() + make_interval(days => p_trial_days));
  insert into schedules (org_id, member_id, weekday, mode)
    select v_org, null, d, case when d <= 5 then 'office' else 'off' end from generate_series(1, 7) d;
  insert into members (org_id, email, full_name, role, status) values (v_org, v_email, nullif(trim(p_owner_name), ''), 'owner', 'invited');
  perform public.console_log(v_org, 'company.create', p_reason, jsonb_build_object('domain', v_domain, 'owner', v_email, 'trial_days', p_trial_days));
  return v_org;
end $$;

create or replace function public.console_set_plan(p_org uuid, p_plan text, p_seats integer, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare s subscriptions%rowtype;
begin
  perform public.console_require(array['owner','finance'], p_reason, true);
  if p_plan not in ('basic','pro') then raise exception 'Choose Basic or Pro.'; end if;
  if p_seats is null or p_seats < 1 or p_seats > 100000 then raise exception 'Seats must be at least 1.'; end if;
  select * into s from subscriptions where org_id = p_org for update;
  if not found then raise exception 'Company not found.'; end if;
  update subscriptions set plan = p_plan, seats_paid = p_seats where org_id = p_org;
  perform public.console_log(p_org, 'company.set_plan', p_reason,
    jsonb_build_object('from_plan', s.plan, 'to_plan', p_plan, 'from_seats', s.seats_paid, 'to_seats', p_seats));
end $$;

create or replace function public.console_set_archived(p_org uuid, p_archived boolean, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support'], p_reason, true);
  update organizations set archived_at = case when p_archived then now() else null end,
         suspended_at = case when p_archived then coalesce(suspended_at, now()) else suspended_at end
   where id = p_org;
  if not found then raise exception 'Company not found.'; end if;
  perform public.console_log(p_org, case when p_archived then 'company.archive' else 'company.unarchive' end, p_reason, '{}'::jsonb);
end $$;

-- Permanent delete: Global admin only, company must be archived first, domain typed to confirm.
create or replace function public.console_delete_company(p_org uuid, p_confirm_domain text, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare o organizations%rowtype;
begin
  perform public.console_require(array['owner'], p_reason, true);
  select * into o from organizations where id = p_org for update;
  if not found then raise exception 'Company not found.'; end if;
  if o.archived_at is null then raise exception 'Archive the company first. Deleting is permanent.'; end if;
  if lower(trim(coalesce(p_confirm_domain, ''))) <> o.domain then raise exception 'Type the company domain (%) to confirm.', o.domain; end if;
  perform public.console_log(null, 'company.delete', p_reason, jsonb_build_object('org_id', o.id, 'name', o.name, 'domain', o.domain));
  delete from organizations where id = p_org;
end $$;

-- Read-only "view as company admin": only while the company has granted support access. Logged.
create or replace function public.console_company_snapshot(p_org uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare o organizations%rowtype; v_today date;
begin
  perform public.console_require(array['owner','support']);
  if public.support_access_until(p_org) is null then
    raise exception 'This company has not granted support access. Ask their admin to turn it on in Settings.';
  end if;
  select * into o from organizations where id = p_org;
  v_today := (now() at time zone o.timezone)::date;
  perform public.console_log(p_org, 'support.view_as', null, '{}'::jsonb);
  return jsonb_build_object(
    'org', jsonb_build_object('name', o.name, 'domain', o.domain, 'timezone', o.timezone, 'work_start', o.work_start,
                              'work_end', o.work_end, 'grace_minutes', o.grace_minutes, 'home_radius_m', o.home_radius_m, 'slug', o.slug),
    'today', v_today,
    'people', coalesce((select jsonb_agg(p order by p.name) from (
        select m.id, coalesce(m.full_name, m.email) as name, m.email, m.role, m.status, m.team, m.home_status,
               (select coalesce(lm.full_name, lm.email) from members lm where lm.id = m.line_manager_id) as line_manager,
               (select jsonb_agg(jsonb_build_object('kind', a.kind, 'at', a.at, 'type', a.location_type, 'flags', a.flags) order by a.at)
                  from attendance a where a.member_id = m.id and a.local_date = v_today) as today
          from members m where m.org_id = p_org) p), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(jsonb_build_object('name', l.name, 'lat', l.lat, 'lng', l.lng, 'radius_m', l.radius_m, 'address', l.address))
                           from locations l where l.org_id = p_org), '[]'::jsonb),
    'schedule', coalesce((select jsonb_agg(jsonb_build_object('weekday', s.weekday, 'mode', s.mode) order by s.weekday)
                          from schedules s where s.org_id = p_org and s.member_id is null), '[]'::jsonb),
    'pending', jsonb_build_object(
        'people', (select count(*) from members where org_id = p_org and status = 'pending'),
        'homes', (select count(*) from member_private_locations where org_id = p_org and home_req_lat is not null),
        'corrections', (select count(*) from attendance_correction_requests where org_id = p_org and status = 'pending'),
        'location_requests', (select count(*) from work_location_requests where org_id = p_org and status = 'pending'))
  );
end $$;

-- Company data export (account info always; staff only with support access).
create or replace function public.console_company_export(p_org uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v jsonb;
begin
  perform public.console_require(array['owner','support','finance'], p_reason, true);
  v := public.console_company(p_org) - 'audit';
  if public.support_access_until(p_org) is not null then
    v := v || jsonb_build_object('staff', coalesce((select jsonb_agg(jsonb_build_object('name', full_name, 'email', email, 'role', role,
                                   'status', status, 'team', team, 'joined', created_at)) from members where org_id = p_org), '[]'::jsonb));
  else
    v := v || jsonb_build_object('staff', 'Not included: the company has not granted support access.');
  end if;
  perform public.console_log(p_org, 'company.export', p_reason, '{}'::jsonb);
  return v || jsonb_build_object('exported_at', now());
end $$;

-- ───────────────────────────────────────────── global people search (exact email)
create or replace function public.console_find_person(p_email text)
returns table (user_id uuid, email text, full_name text, company text, org_id uuid, role text, status text,
               last_sign_in_at timestamptz, totp_enrolled boolean, locked boolean, global_admin_role text)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  perform public.console_require(array['owner','support']);
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter the person''s full email address.'; end if;
  perform public.console_log((select m.org_id from members m where lower(m.email) = v_email limit 1), 'people.lookup', null,
                             jsonb_build_object('email', v_email));
  return query
    select u.id, coalesce(m.email, u.email::text), m.full_name, o.name, o.id, m.role, m.status, u.last_sign_in_at,
           exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified' and f.factor_type = 'totp'),
           coalesce(u.banned_until > now(), false),
           (select ps.role from platform_staff ps where ps.user_id = u.id)
      from (select v_email as email) q
      left join auth.users u on lower(u.email) = q.email
      left join members m on lower(m.email) = q.email
      left join organizations o on o.id = m.org_id
     where u.id is not null or m.id is not null;
end $$;

-- ───────────────────────────────────────────── security center
create or replace function public.console_force_signout(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support'], p_reason, true);
  if p_user = auth.uid() then raise exception 'Use Sign out to end your own session.'; end if;
  delete from auth.sessions where user_id = p_user;
  perform public.console_log((select org_id from members where user_id = p_user limit 1), 'security.force_signout', p_reason,
                             jsonb_build_object('user_id', p_user));
end $$;

create or replace function public.console_set_locked(p_user uuid, p_locked boolean, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support'], p_reason, true);
  if p_user = auth.uid() then raise exception 'You cannot lock your own account.'; end if;
  if exists (select 1 from platform_staff where user_id = p_user and role = 'owner') and public.console_role() <> 'owner' then
    raise exception 'Only a Global admin can lock another Global admin.';
  end if;
  update auth.users set banned_until = case when p_locked then 'infinity'::timestamptz else null end where id = p_user;
  if not found then raise exception 'Account not found.'; end if;
  if p_locked then delete from auth.sessions where user_id = p_user; end if;
  perform public.console_log((select org_id from members where user_id = p_user limit 1),
                             case when p_locked then 'security.lock' else 'security.unlock' end, p_reason, jsonb_build_object('user_id', p_user));
end $$;

create or replace function public.console_reset_mfa(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support'], p_reason, true);
  if p_user = auth.uid() then raise exception 'You cannot reset your own two-factor here.'; end if;
  delete from auth.mfa_factors where user_id = p_user;
  delete from public.auth_recovery_codes where user_id = p_user;
  delete from auth.sessions where user_id = p_user;
  perform public.console_log((select org_id from members where user_id = p_user limit 1), 'security.reset_2fa', p_reason,
                             jsonb_build_object('user_id', p_user));
end $$;

create or replace function public.console_security()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','viewer']);
  return jsonb_build_object(
    'admin_2fa', coalesce((select jsonb_agg(c order by c.missing desc, c.name) from (
        select o.id, o.name, count(m.id) as admins,
               count(m.id) filter (where exists (select 1 from auth.mfa_factors f where f.user_id = m.user_id and f.status='verified' and f.factor_type='totp')) as with_2fa,
               count(m.id) filter (where not exists (select 1 from auth.mfa_factors f where f.user_id = m.user_id and f.status='verified' and f.factor_type='totp')) as missing
          from organizations o join members m on m.org_id = o.id and m.status = 'active' and m.role in ('owner','admin')
         where o.archived_at is null group by o.id, o.name) c), '[]'::jsonb),
    'locked', coalesce((select jsonb_agg(jsonb_build_object('user_id', u.id, 'email', u.email, 'company',
                  (select o.name from members m join organizations o on o.id = m.org_id where m.user_id = u.id limit 1)))
                from auth.users u where u.banned_until > now()), '[]'::jsonb),
    'sign_ins_24h', (select count(*) from auth.users where last_sign_in_at > now() - interval '24 hours'),
    'sign_ins_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'events', coalesce((select jsonb_agg(e order by e.created_at desc) from (
        select ev.created_at, ev.kind, m.email, o.name as company
          from member_security_events ev left join members m on m.id = ev.member_id left join organizations o on o.id = ev.org_id
         order by ev.created_at desc limit 100) e), '[]'::jsonb),
    'global_admin_actions', coalesce((select jsonb_agg(a order by a.at desc) from (
        select at, actor_email, action, reason from platform_audit where action like 'security.%' or action like 'team.%'
         order by at desc limit 50) a), '[]'::jsonb)
  );
end $$;

-- ───────────────────────────────────────────── global admin team
create or replace function public.console_team()
returns table (user_id uuid, email text, role text, created_at timestamptz, last_sign_in_at timestamptz, totp_enrolled boolean)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','finance','viewer']);
  return query select p.user_id, p.email, p.role, p.created_at, u.last_sign_in_at,
      exists (select 1 from auth.mfa_factors f where f.user_id = p.user_id and f.status='verified' and f.factor_type='totp')
    from platform_staff p left join auth.users u on u.id = p.user_id order by p.created_at;
end $$;

create or replace function public.console_team_add(p_email text, p_role text, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_user uuid; v_email text := lower(trim(coalesce(p_email, '')));
begin
  perform public.console_require(array['owner'], p_reason, true);
  if p_role not in ('owner','support','finance','viewer') then raise exception 'Choose a valid role.'; end if;
  select id into v_user from auth.users where lower(email) = v_email;
  if not found then raise exception 'No 5ime login exists for %. Ask them to create one (Forgot password / one-time code) first.', v_email; end if;
  if exists (select 1 from platform_staff where user_id = v_user) then raise exception '% is already on the Global Admin team.', v_email; end if;
  insert into platform_staff (user_id, email, role) values (v_user, v_email, p_role);
  perform public.console_log(null, 'team.add', p_reason, jsonb_build_object('email', v_email, 'role', p_role));
end $$;

create or replace function public.console_team_set_role(p_user uuid, p_role text, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_old text;
begin
  perform public.console_require(array['owner'], p_reason, true);
  if p_role not in ('owner','support','finance','viewer') then raise exception 'Choose a valid role.'; end if;
  select role into v_old from platform_staff where user_id = p_user for update;
  if not found then raise exception 'Not on the Global Admin team.'; end if;
  if v_old = 'owner' and p_role <> 'owner' and (select count(*) from platform_staff where role = 'owner') <= 1 then
    raise exception 'There must always be at least one Global admin.';
  end if;
  update platform_staff set role = p_role where user_id = p_user;
  perform public.console_log(null, 'team.set_role', p_reason, jsonb_build_object('user_id', p_user, 'from', v_old, 'to', p_role));
end $$;

create or replace function public.console_team_remove(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_old platform_staff%rowtype;
begin
  perform public.console_require(array['owner'], p_reason, true);
  select * into v_old from platform_staff where user_id = p_user for update;
  if not found then raise exception 'Not on the Global Admin team.'; end if;
  if v_old.role = 'owner' and (select count(*) from platform_staff where role = 'owner') <= 1 then
    raise exception 'There must always be at least one Global admin.';
  end if;
  delete from platform_staff where user_id = p_user;
  perform public.console_log(null, 'team.remove', p_reason, jsonb_build_object('email', v_old.email, 'role', v_old.role));
end $$;

-- ───────────────────────────────────────────── pricing, settings and announcements (actions)
create or replace function public.console_plans()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','finance','viewer']);
  return public.public_plans() || jsonb_build_object(
    'maintenance_mode', (select maintenance_mode from platform_settings where id),
    'maintenance_message', (select maintenance_message from platform_settings where id));
end $$;

create or replace function public.console_set_plan_terms(p_plan text, p_name text, p_price integer, p_blurb text,
                                                         p_features text[], p_max_locations integer, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_old platform_plans%rowtype;
begin
  perform public.console_require(array['owner'], p_reason, true);
  select * into v_old from platform_plans where plan = p_plan for update;
  if not found then raise exception 'Unknown plan.'; end if;
  update platform_plans set name = trim(p_name), price_naira = p_price, blurb = coalesce(trim(p_blurb), ''),
         features = coalesce(array(select trim(f) from unnest(p_features) f where trim(f) <> ''), '{}'),
         max_locations = p_max_locations, updated_at = now(), updated_by = auth.uid()
   where plan = p_plan;
  perform public.console_log(null, 'pricing.update', p_reason, jsonb_build_object('plan', p_plan, 'from_price', v_old.price_naira,
                             'to_price', p_price, 'max_locations', p_max_locations));
end $$;

create or replace function public.console_set_platform(p_trial_days integer, p_maintenance boolean, p_message text, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_old platform_settings%rowtype;
begin
  perform public.console_require(array['owner'], p_reason, true);
  select * into v_old from platform_settings where id for update;
  update platform_settings set trial_days = p_trial_days, maintenance_mode = coalesce(p_maintenance, false),
         maintenance_message = nullif(trim(p_message), ''), updated_at = now(), updated_by = auth.uid() where id;
  perform public.console_log(null, 'platform.settings', p_reason, jsonb_build_object(
    'trial_days', jsonb_build_array(v_old.trial_days, p_trial_days), 'maintenance', jsonb_build_array(v_old.maintenance_mode, p_maintenance)));
end $$;

create or replace function public.console_announce(p_message text, p_level text, p_org uuid, p_audience text, p_hours integer, p_reason text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_id uuid;
begin
  perform public.console_require(array['owner','support'], p_reason, true);
  insert into platform_announcements (message, level, org_id, audience, ends_at, created_by)
    values (trim(p_message), p_level, p_org, coalesce(p_audience, 'everyone'),
            case when p_hours is null or p_hours <= 0 then null else now() + make_interval(hours => p_hours) end, auth.uid())
    returning id into v_id;
  perform public.console_log(p_org, 'announcement.create', p_reason, jsonb_build_object('id', v_id, 'level', p_level, 'audience', p_audience));
  return v_id;
end $$;

create or replace function public.console_end_announcement(p_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support']);
  update platform_announcements set ended_at = now() where id = p_id and ended_at is null;
  perform public.console_log(null, 'announcement.end', null, jsonb_build_object('id', p_id));
end $$;

create or replace function public.console_announcements()
returns table (id uuid, message text, level text, company text, audience text, starts_at timestamptz, ends_at timestamptz, ended_at timestamptz, live boolean)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','finance','viewer']);
  return query select a.id, a.message, a.level, o.name, a.audience, a.starts_at, a.ends_at, a.ended_at,
      (a.ended_at is null and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now()))
    from platform_announcements a left join organizations o on o.id = a.org_id order by a.created_at desc limit 100;
end $$;

-- ───────────────────────────────────────────── grants
do $$
declare f text;
begin
  foreach f in array array[
    'console_note(uuid,text,text,jsonb)', 'console_revenue()', 'console_payments(date,date,text,text)', 'console_health()',
    'console_companies(text,boolean)', 'console_create_company(text,text,text,text,integer,text)', 'console_set_plan(uuid,text,integer,text)',
    'console_set_archived(uuid,boolean,text)', 'console_delete_company(uuid,text,text)', 'console_company_snapshot(uuid)',
    'console_company_export(uuid,text)', 'console_find_person(text)', 'console_force_signout(uuid,text)',
    'console_set_locked(uuid,boolean,text)', 'console_reset_mfa(uuid,text)', 'console_security()', 'console_team()',
    'console_team_add(text,text,text)', 'console_team_set_role(uuid,text,text)', 'console_team_remove(uuid,text)', 'console_plans()',
    'console_set_plan_terms(text,text,integer,text,text[],integer,text)', 'console_set_platform(integer,boolean,text,text)',
    'console_announce(text,text,uuid,text,integer,text)', 'console_end_announcement(uuid)', 'console_announcements()']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

commit;
