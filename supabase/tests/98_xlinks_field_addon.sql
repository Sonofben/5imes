-- 5ime: company links under /c/ and the field staff add-on (migration 0025).
-- Visit Ltd (Premium): boss (owner), ade (staff). Other Visit Ltd (Basic): boss.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
select set_config('test.uid', '', false);
select set_config('test.v', (select id::text from public.organizations where domain = 'visit.ng'), false);
select set_config('test.o', (select id::text from public.organizations where domain = 'other-visit.ng'), false);
select set_config('test.oldslug', (select slug from public.organizations where domain = 'visit.ng'), false);

\echo '--- company links'
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select test.ok(public.request_company_link('visit-hq') ->> 'status' = 'changed', 'A link that matches the company name changes at once');
select test.ok(public.request_company_link('blue-ocean') ->> 'status' = 'pending', 'A link that doesn''t match waits for Global Admin approval');
select test.ok((select slug = 'visit-hq' from public.organizations where id = current_setting('test.v')::uuid), 'and the current link stays until then');
select test.ok((select count(*) = 1 from public.company_link_requests), 'The admin sees the waiting request');
select test.ok(public.request_company_link(current_setting('test.oldslug')) ->> 'status' = 'changed', 'A company can go back to one of its own old links');
select public.request_company_link('visit-hq');
select public.request_company_link('blue-ocean');
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select test.ok((select count(*) = 0 from public.company_link_requests), 'Staff don''t see link requests');
select test.blocked($$select public.request_company_link('visit-team')$$, 'admins', 'Staff cannot change the link');
select test.as_console('00000000-0000-0000-0000-00000000f911', 'boss@other-visit.ng');
select test.blocked(format($$select public.request_company_link(%L)$$, current_setting('test.oldslug')), 'already taken',
  'An old link of another company can never be taken');
select test.blocked($$select public.request_company_link('visit-hq')$$, 'already taken', 'Nor its current link');
reset role;
select set_config('test.uid', '', false);
set role anon;
select test.ok(public.resolve_company_link(current_setting('test.oldslug')) = 'visit-hq', 'An old link points to the current one');
select test.ok(public.resolve_company_link('visit-hq') = 'visit-hq', 'The current link points to itself');
select test.ok(public.resolve_company_link('nobody-here') is null, 'An unknown link points nowhere');
reset role;

\echo '--- Global Admin approval'
set role authenticated;
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select test.ok((select count(*) = 1 from public.console_company_link_requests() where slug = 'blue-ocean'), 'Global Admin sees the request');
select public.console_decide_company_link(current_setting('test.v')::uuid, true, 'Brand name confirmed with client');
select test.ok((select count(*) = 0 from public.console_company_link_requests()), 'Approving clears the request');
reset role;
select set_config('test.uid', '', false);
select test.ok((select slug = 'blue-ocean' from public.organizations where id = current_setting('test.v')::uuid), 'and changes the link');
select test.ok(public.slug_matches_org(current_setting('test.v')::uuid, 'vl') and not public.slug_matches_org(current_setting('test.v')::uuid, 'acme'),
  'Initials match the company; an unrelated word does not');
-- put the original link back for later tests
update public.organizations set slug = current_setting('test.oldslug') where id = current_setting('test.v')::uuid;

\echo '--- field staff add-on on Pro'
create temporary table o_sub as select * from public.subscriptions where org_id = current_setting('test.o')::uuid;
delete from public.payments where org_id = current_setting('test.o')::uuid and status = 'pending';
update public.subscriptions set plan = 'pro', status = 'active', seats_paid = 10, billing_interval_months = 1,
  current_period_start = now() - interval '15 days', current_period_end = now() + interval '15 days',
  paystack_subscription_code = null, paystack_plan_code = null, cancel_at_period_end = false
 where org_id = current_setting('test.o')::uuid;
update public.organizations set field_addon_seats = 0 where id = current_setting('test.o')::uuid;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f911', 'boss@other-visit.ng');
select test.ok(not public.org_has_field(current_setting('test.o')::uuid), 'Pro without the add-on has no field staff');
select set_config('test.famt', public.prepare_paystack_field_addon('5ime-field-1', 4) ->> 'amount_kobo', false);
select test.ok(current_setting('test.famt')::bigint between 4 * 150 * 100 * 45 / 100 and 4 * 150 * 100 * 55 / 100,
  'Adding 4 places half way through a month costs about half of 4 × ₦150');
select test.blocked($$select public.prepare_paystack_field_addon('5ime-field-2', 5)$$, 'pending', 'One payment at a time');
reset role;
set role service_role;
select test.ok((public.apply_paystack_payment('5ime-field-1', 'success', (select amount_kobo from public.payments where reference = '5ime-field-1'), 'NGN') ->> 'ok')::boolean,
  'A successful Paystack payment is applied');
reset role;
select test.ok((select field_addon_seats = 4 from public.organizations where id = current_setting('test.o')::uuid), 'and sets the field staff places automatically');
select test.ok(public.org_has_field(current_setting('test.o')::uuid), 'Field staff is now on');
select test.ok(public.renewal_amount_kobo(current_setting('test.o')::uuid) = (10 * 600 + 4 * 150) * 100::bigint, 'The renewal charge includes the add-on');
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f911', 'boss@other-visit.ng');
select test.blocked($$select public.prepare_paystack_field_addon('5ime-field-3', 4)$$, 'more field staff places', 'Places only go up mid term');
select test.blocked($$select public.prepare_paystack_field_addon('5ime-field-3', 11)$$, 'more than paid seats', 'No more places than paid seats');
select test.ok((public.prepare_paystack_subscription('5ime-field-4', 'pro', 10, 3, false, 4) ->> 'amount_kobo')::bigint = (10 * 600 + 4 * 150) * 3 * 100::bigint,
  'Paying the next Pro term includes the add-on for the same term');
reset role;
delete from public.payments where reference = '5ime-field-4';
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f911', 'boss@other-visit.ng');
select test.blocked($$select public.prepare_paystack_subscription('5ime-field-5', 'basic', 10, 1, false, 2)$$, 'for Pro', 'Basic cannot buy the add-on');
reset role;

\echo '--- the add-on stops on Basic'
update public.subscriptions set current_period_end = now() - interval '1 day' where org_id = current_setting('test.o')::uuid;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f911', 'boss@other-visit.ng');
select test.ok((public.prepare_paystack_subscription('5ime-field-6', 'premium', 10, 1, false, 4) ->> 'amount_kobo')::bigint = 10 * 1000 * 100::bigint,
  'Premium is never charged for field staff');
reset role;
delete from public.payments where reference = '5ime-field-6';
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f911', 'boss@other-visit.ng');
select public.prepare_paystack_subscription('5ime-field-7', 'basic', 10, 1, false, 0);
reset role;
set role service_role;
select public.apply_paystack_payment('5ime-field-7', 'success', (select amount_kobo from public.payments where reference = '5ime-field-7'), 'NGN');
reset role;
select test.ok((select field_addon_seats = 0 from public.organizations where id = current_setting('test.o')::uuid), 'Moving to Basic clears the add-on');

update public.subscriptions s set plan = a.plan, status = a.status, seats_paid = a.seats_paid, billing_interval_months = a.billing_interval_months,
  current_period_start = a.current_period_start, current_period_end = a.current_period_end, trial_ends_at = a.trial_ends_at
  from o_sub a where s.org_id = a.org_id;
delete from public.payments where reference like '5ime-field-%';
\o
\echo '✅ COMPANY LINK AND FIELD ADD-ON TESTS PASSED'
