-- 0018 · Plan tiers (October 2026 pricing)
--
--   Basic   ₦300 / staff / month · up to 15 staff · logo only · no visitors
--   Pro     ₦600 · unlimited staff · full branding · visitors at ONE office, up to 100 visits a month
--   Premium ₦1,000 · everything · visitors at every office, unlimited, plus the reception tablet,
--           fire-drill roll call, blocklist and visitor reports
--
-- A live trial gets everything, as before. Companies already on Basic with more than 15 staff
-- keep them; they just can't add more until they move to Pro.

alter table public.platform_plans add column if not exists max_seats integer
  check (max_seats is null or max_seats between 1 and 100000);
alter table public.platform_plans add column if not exists max_visitors_month integer
  check (max_visitors_month is null or max_visitors_month between 0 and 1000000);

update public.platform_plans set price_naira = 300, max_seats = 15, max_visitors_month = 0,
  blurb = 'For small teams with one office.',
  features = array['Up to 15 staff','1 office + approved home locations','GPS check-in and check-out (200 m area)',
    'One weekly office/home schedule for everyone','Late arrival and early exit tracking','Live “who’s in today” dashboard',
    'Nigerian public holidays built in','Your logo in the app','30 days of history, CSV export','Email support'],
  updated_at = now()
where plan = 'basic';

update public.platform_plans set price_naira = 600, max_seats = null, max_visitors_month = 100,
  blurb = 'For growing companies with branches.',
  features = array['Everything in Basic, with unlimited staff','Unlimited offices and branches, check-in area per office',
    'Schedules per person or team','Managers and teams','Your full brand: colours, sign-in page, app icon and emails',
    'Visitor management at one office (up to 100 visits a month)','Weak-GPS flags, device and IP records',
    'Unlimited history and full reports','WhatsApp and email support'],
  updated_at = now()
where plan = 'pro';

update public.platform_plans set price_naira = 1000, max_seats = null, max_visitors_month = null,
  blurb = 'For busy offices that welcome visitors.',
  features = array['Everything in Pro','Unlimited visitors at every office','Reception tablet with badge printing',
    'Fire-drill roll call: staff and visitors on site','Visitor blocklist','Visitor reports and full audit trail',
    'Priority support and set-up help'],
  updated_at = now()
where plan = 'premium';

-- The plans list the website and billing page read now carries the limits too.
create or replace function public.public_plans()
returns jsonb language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select jsonb_build_object(
    'trial_days', public.platform_trial_days(),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', plan, 'name', name, 'pricePerSeat', price_naira,
               'blurb', blurb, 'features', to_jsonb(features), 'maxLocations', max_locations,
               'maxSeats', max_seats, 'maxVisitorsMonth', max_visitors_month) order by price_naira)
             from public.platform_plans), '[]'::jsonb));
$$;
revoke all on function public.public_plans() from public;
grant execute on function public.public_plans() to anon, authenticated, service_role;

-- Which plan a company is on right now: 'trial', 'basic', 'pro', 'premium', or null (lapsed).
create or replace function public.org_plan_now(p_org uuid)
returns text language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select case
    when s.status = 'trialing' and s.trial_ends_at >= now() then 'trial'
    when s.status in ('active','past_due')
         and coalesce(s.current_period_end, now()) >= now() - interval '3 days'
         and not (s.cancel_at_period_end and s.current_period_end <= now()) then s.plan
  end
  from public.subscriptions s where s.org_id = p_org
$$;
revoke all on function public.org_plan_now(uuid) from public, anon;
grant execute on function public.org_plan_now(uuid) to authenticated, service_role;

-- Visitor management: Pro and Premium (and trials).
create or replace function public.org_has_visitors(p_org uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select coalesce(public.org_plan_now(p_org) in ('trial','pro','premium'), false)
$$;
revoke all on function public.org_has_visitors(uuid) from public, anon;
grant execute on function public.org_has_visitors(uuid) to authenticated, service_role;

create or replace function public.require_visitors(p_org uuid)
returns void language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not public.org_has_visitors(p_org) then
    raise exception 'Visitor management is part of the Pro and Premium plans. Ask your admin to upgrade.';
  end if;
end $$;
revoke all on function public.require_visitors(uuid) from public, anon;
grant execute on function public.require_visitors(uuid) to authenticated, service_role;

-- 'none', 'pro' (limited) or 'premium' (everything; trials too). The app uses this to show or lock pages.
create or replace function public.org_visitor_tier(p_org uuid)
returns text language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select case public.org_plan_now(p_org) when 'pro' then 'pro' when 'premium' then 'premium' when 'trial' then 'premium' else 'none' end
$$;
revoke all on function public.org_visitor_tier(uuid) from public, anon;
grant execute on function public.org_visitor_tier(uuid) to authenticated, service_role;

-- On Pro, visitors are managed at one office: the one with the oldest live walk-in poster, else the first office.
create or replace function public.org_visitor_location(p_org uuid)
returns uuid language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select coalesce(
    (select l.location_id from public.visitor_links l where l.org_id = p_org and l.revoked_at is null order by l.created_at limit 1),
    (select x.id from public.locations x where x.org_id = p_org order by x.created_at, x.id limit 1))
$$;
revoke all on function public.org_visitor_location(uuid) from public, anon;
grant execute on function public.org_visitor_location(uuid) to authenticated, service_role;

-- Everyday visitor features move from Premium-only to Pro and Premium. The tablet, blocklist,
-- roll call and reports stay Premium. (Same rewrite approach as 0012: only the gate call changes.)
do $$
declare f record; v_def text; v_new text;
begin
  for f in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f'
             and p.proname in ('vms_invite','vms_cancel','vms_staff_sign','vms_save_settings','vms_desk_find','vms_admit',
                               'vms_visitor_link','vms_update_settings','walkin_context','walkin_submit','visit_checkin')
  loop
    v_def := pg_get_functiondef(f.oid);
    v_new := replace(v_def, 'public.require_premium(', 'public.require_visitors(');
    v_new := replace(v_new, 'public.org_has_premium(k.org_id)', 'public.org_has_visitors(k.org_id)');
    if v_new <> v_def then execute v_new; end if;
  end loop;
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' and p.proname in ('vms_report','vms_on_site')
  loop
    v_def := pg_get_functiondef(f.oid);
    if position('require_premium' in v_def) = 0 then
      execute regexp_replace(v_def, '\mbegin\M', 'begin perform public.require_premium(public.my_org_id());');
    end if;
  end loop;
end $$;

-- Basic: at most max_seats staff (active + invited). Existing extra staff stay; adding more is refused.
create or replace function public.enforce_plan_staff_limit()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_plan text; v_max integer; v_used integer;
begin
  if new.status not in ('active','invited') then return new; end if;
  if tg_op = 'UPDATE' and old.status in ('active','invited') then return new; end if;
  v_plan := public.org_plan_now(new.org_id);
  if v_plan is null or v_plan = 'trial' then return new; end if;
  select max_seats into v_max from public.platform_plans where plan = v_plan;
  if v_max is null then return new; end if;
  select count(*)::integer into v_used from public.members
   where org_id = new.org_id and status in ('active','invited') and id is distinct from new.id;
  if v_used >= v_max then
    raise exception 'The Basic plan includes up to % staff. Upgrade to Pro to add more.', v_max;
  end if;
  return new;
end $$;
drop trigger if exists members_plan_staff_limit on public.members;
create trigger members_plan_staff_limit before insert or update of status on public.members
for each row execute function public.enforce_plan_staff_limit();

-- Basic can't be bought, granted or topped up beyond its limit.
create or replace function public.enforce_plan_seat_purchase()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_max integer; v_seats integer;
begin
  if tg_table_name = 'payments' then v_seats := new.seats;
  else
    if new.status = 'trialing' then return new; end if;
    if tg_op = 'UPDATE' and new.plan = old.plan and new.seats_paid <= old.seats_paid then return new; end if;
    v_seats := new.seats_paid;
  end if;
  select max_seats into v_max from public.platform_plans where plan = new.plan;
  if v_max is not null and v_seats > v_max then
    raise exception 'The Basic plan includes up to % staff. Choose Pro for more.', v_max;
  end if;
  return new;
end $$;
drop trigger if exists payments_plan_seat_limit on public.payments;
create trigger payments_plan_seat_limit before insert on public.payments
for each row execute function public.enforce_plan_seat_purchase();
drop trigger if exists subscriptions_plan_seat_limit on public.subscriptions;
create trigger subscriptions_plan_seat_limit before insert or update of plan, seats_paid on public.subscriptions
for each row execute function public.enforce_plan_seat_purchase();

-- Pro: visitors at one office and up to max_visitors_month visits per calendar month (company time).
create or replace function public.enforce_plan_visitor_limits()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_plan text; v_max integer; v_used integer; v_tz text; v_month_start timestamptz;
begin
  v_plan := public.org_plan_now(new.org_id);
  if v_plan is distinct from 'pro' then return new; end if;
  if new.location_id is not null and new.location_id is distinct from public.org_visitor_location(new.org_id) then
    raise exception 'The Pro plan includes visitor management at one office. Upgrade to Premium to welcome visitors at every office.';
  end if;
  select max_visitors_month into v_max from public.platform_plans where plan = 'pro';
  if v_max is null then return new; end if;
  select timezone into v_tz from public.organizations where id = new.org_id;
  v_month_start := date_trunc('month', now() at time zone coalesce(v_tz, 'Africa/Lagos')) at time zone coalesce(v_tz, 'Africa/Lagos');
  select count(*)::integer into v_used from public.visits where org_id = new.org_id and created_at >= v_month_start;
  if v_used >= v_max then
    raise exception 'This company has reached the % visitors included in Pro this month. Upgrade to Premium for unlimited visitors.', v_max;
  end if;
  return new;
end $$;
drop trigger if exists visits_plan_limits on public.visits;
create trigger visits_plan_limits before insert on public.visits
for each row execute function public.enforce_plan_visitor_limits();

create or replace function public.enforce_plan_visitor_link()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if public.org_plan_now(new.org_id) = 'pro' and new.revoked_at is null and exists (
       select 1 from public.visitor_links l where l.org_id = new.org_id and l.revoked_at is null
          and l.location_id <> new.location_id and l.id is distinct from new.id) then
    raise exception 'The Pro plan includes visitor management at one office. Upgrade to Premium for every office.';
  end if;
  return new;
end $$;
drop trigger if exists visitor_links_plan_limit on public.visitor_links;
create trigger visitor_links_plan_limit before insert on public.visitor_links
for each row execute function public.enforce_plan_visitor_link();

-- How much of the plan a company is using (admins see it on Billing and before inviting staff).
create or replace function public.my_plan_usage()
returns jsonb language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  with o as (select public.my_org_id() as id),
       p as (select public.org_plan_now((select id from o)) as plan)
  select jsonb_build_object(
    'plan', (select plan from p),
    'staff', (select count(*) from public.members m where m.org_id = (select id from o) and m.status in ('active','invited')),
    'max_staff', (select pp.max_seats from public.platform_plans pp where pp.plan = (select plan from p)),
    'visitor_tier', public.org_visitor_tier((select id from o)),
    'visits_this_month', (select count(*) from public.visits v, public.organizations g
        where v.org_id = g.id and g.id = (select id from o)
          and v.created_at >= date_trunc('month', now() at time zone g.timezone) at time zone g.timezone),
    'max_visits_month', (select pp.max_visitors_month from public.platform_plans pp where pp.plan = (select plan from p)))
  where (select id from o) is not null
$$;
revoke all on function public.my_plan_usage() from public, anon;
grant execute on function public.my_plan_usage() to authenticated;
