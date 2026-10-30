-- 5ime: plan tiers (migration 0018). Reuses Visit Ltd and Other Visit Ltd (Basic) from 96–98.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
select set_config('test.uid', '', false);
select set_config('test.v', (select id::text from public.organizations where domain = 'visit.ng'), false);
select set_config('test.o', (select id::text from public.organizations where domain = 'other-visit.ng'), false);

\echo '--- prices and limits'
select test.ok(public.plan_price('basic') = 300 and public.plan_price('pro') = 600 and public.plan_price('premium') = 1000,
  'Prices are ₦300 / ₦600 / ₦1,000 per staff member');
select test.ok((select (p ->> 'maxSeats')::int = 15 from jsonb_array_elements(public.public_plans() -> 'plans') p where p ->> 'id' = 'basic'),
  'The public plan list says Basic allows 15 staff');
select test.ok((select (p ->> 'maxVisitorsMonth')::int = 100 from jsonb_array_elements(public.public_plans() -> 'plans') p where p ->> 'id' = 'pro'),
  'and Pro includes 100 visitors a month');

\echo '--- Basic: up to 15 staff'
select test.ok(public.org_plan_now(current_setting('test.o')::uuid) = 'basic', 'Other Visit Ltd is on paid Basic');
update public.platform_plans set max_seats = (select count(*) from public.members where org_id = current_setting('test.o')::uuid and status in ('active','invited'))
 where plan = 'basic';
select test.blocked(format($$insert into public.members (org_id, email, full_name, role, status) values (%L, 'extra@other-visit.ng', 'Extra', 'member', 'invited')$$,
  current_setting('test.o')), 'Upgrade to Pro', 'A Basic company at its staff limit is asked to upgrade to Pro');
update public.platform_plans set max_seats = 15 where plan = 'basic';
select test.blocked(format($$insert into public.payments (reference, org_id, plan, seats, billing_interval_months, amount_kobo) values ('5ime-tier-1', %L, 'basic', 16, 1, 100)$$,
  current_setting('test.o')), 'Choose Pro', 'Basic cannot be bought for more than 15 staff');
select test.blocked(format($$update public.subscriptions set seats_paid = 20 where org_id = %L$$, current_setting('test.o')),
  'Choose Pro', 'or topped up beyond 15');
update public.subscriptions set seats_paid = 20, plan = 'pro' where org_id = current_setting('test.o')::uuid;
select test.ok((select seats_paid = 20 from public.subscriptions where org_id = current_setting('test.o')::uuid), 'Pro has no staff limit');
select test.blocked(format($$update public.subscriptions set plan = 'basic' where org_id = %L$$, current_setting('test.o')),
  'Choose Pro', 'A company with 20 seats cannot move down to Basic');
update public.subscriptions set plan = 'basic', seats_paid = 5 where org_id = current_setting('test.o')::uuid;

\echo '--- branding level: full on Pro and Premium, logo only on Basic'
select set_config('test.vs', (select slug from public.organizations where domain = 'visit.ng'), false);
select set_config('test.os', (select slug from public.organizations where domain = 'other-visit.ng'), false);
set role anon;
select test.ok(public.org_brand_level(current_setting('test.vs')) = 'full'
  and public.org_brand_level(current_setting('test.os')) = 'logo'
  and public.org_brand_level('no-such-company') is null, 'Public pages know whether to show the company brand');
reset role;
select set_config('test.uid', '', false);

\echo '--- Pro: visitors at one office, 100 a month'
update public.subscriptions set plan = 'pro' where org_id = current_setting('test.v')::uuid;
select test.ok(public.org_visitor_tier(current_setting('test.v')::uuid) = 'pro', 'Visit Ltd is now on Pro');
insert into public.locations (org_id, name, lat, lng, radius_m) values (current_setting('test.v')::uuid, 'Branch two', 6.6, 3.4, 150);
select set_config('test.l2', (select id::text from public.locations where org_id = current_setting('test.v')::uuid and name = 'Branch two'), false);
select test.blocked(format($$insert into public.visitor_links (org_id, location_id, token) values (%L, %L, 'tier-test-token-0001')$$,
  current_setting('test.v'), current_setting('test.l2')), 'one office', 'Pro cannot open a second walk-in poster at another office');
select test.blocked(format($$insert into public.visits (org_id, location_id, visitor_name, code) values (%L, %L, 'Branch Guest', 'TIER0001')$$,
  current_setting('test.v'), current_setting('test.l2')), 'one office', 'or record visitors at another office');
insert into public.visits (org_id, location_id, visitor_name, code)
  values (current_setting('test.v')::uuid, public.org_visitor_location(current_setting('test.v')::uuid), 'Main Guest', 'TIER0002');
select test.ok(true, 'Visitors at the reception office are fine');
update public.platform_plans set max_visitors_month = (select count(*) from public.visits where org_id = current_setting('test.v')::uuid) where plan = 'pro';
select test.blocked(format($$insert into public.visits (org_id, location_id, visitor_name, code) values (%L, null, 'One Too Many', 'TIER0003')$$,
  current_setting('test.v')), 'Upgrade to Premium', 'After the monthly allowance, Pro is asked to upgrade');
update public.platform_plans set max_visitors_month = 100 where plan = 'pro';

set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select test.ok((public.my_plan_usage() ->> 'visitor_tier') = 'pro' and (public.my_plan_usage() ->> 'max_visits_month')::int = 100,
  'The admin can see the plan usage');
select test.blocked($$select public.vms_report(current_date - 7, current_date)$$, 'Premium', 'Visitor reports are Premium');
select test.blocked($$select * from public.vms_on_site(null)$$, 'Premium', 'Fire-drill roll call is Premium');
select test.ok(public.vms_desk_find('ZZZZ9999') is null or true, 'Everyday desk tools still work on Pro');
reset role;
select set_config('test.uid', '', false);
delete from public.visits where code in ('TIER0002');
delete from public.locations where id = current_setting('test.l2')::uuid;
update public.subscriptions set plan = 'premium' where org_id = current_setting('test.v')::uuid;

\o
\echo '✅ PLAN TIER TESTS PASSED'
