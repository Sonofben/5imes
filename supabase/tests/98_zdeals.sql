-- 5ime: price deals for one company (migration 0029). Other Visit Ltd (Basic): boss f911.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
reset role;
select set_config('test.uid', '', false);
select set_config('test.o', (select id::text from public.organizations where domain = 'other-visit.ng'), false);
create temporary table o_sub2 as select * from public.subscriptions where org_id = current_setting('test.o')::uuid;
delete from public.payments where org_id = current_setting('test.o')::uuid and status = 'pending';
-- An expired paid term, so a new term can be bought on any plan.
update public.subscriptions set status = 'active', plan = 'basic', seats_paid = 5, current_period_end = now() - interval '1 day',
  paystack_subscription_code = null, paystack_plan_code = null, cancel_at_period_end = false where org_id = current_setting('test.o')::uuid;

\echo '--- setting deals'
set role authenticated;
select test.as_console('00000000-0000-0000-0000-0000000000c2', 'helpdesk@koraforge.com');
select test.blocked(format($$select public.console_set_deal(%L, 'percent', 20, null, 12, null, null, 'Loyal client')$$, current_setting('test.o')), 'cannot do this', 'Read-only admins cannot give deals');
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select test.blocked(format($$select public.console_set_deal(%L, 'percent', 120, null, 12, null, null, 'Too much')$$, current_setting('test.o')), 'at most 100', 'A percentage cannot pass 100');
select public.console_set_deal(current_setting('test.o')::uuid, 'percent', 20, null, 24, null, 'Launch partner', 'Agreed with client for 2 years');

\echo '--- the company pays the deal price'
select test.as_console('00000000-0000-0000-0000-00000000f911', 'boss@other-visit.ng');
select test.ok((public.my_pricing() -> 'basic' ->> 'percentOff')::numeric = 20, 'The admin sees the deal on Billing');
select test.ok((public.prepare_paystack_subscription('5ime-deal-1', 'basic', 5, 1, false, 0) ->> 'amount_kobo')::bigint = 5 * 300 * 100 * 80 / 100,
  '20% off is charged at checkout');
reset role;
set role service_role;
select public.apply_paystack_payment('5ime-deal-1', 'success', (select amount_kobo from public.payments where reference = '5ime-deal-1'), 'NGN');
reset role;
select test.ok((select uses = 1 from public.price_deals where org_id = current_setting('test.o')::uuid and revoked_at is null), 'The deal counts the payment');

\echo '--- custom price, limited payments, then back to normal'
set role authenticated;
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select public.console_set_deal(current_setting('test.o')::uuid, 'custom_price', 450, 'pro', null, 1, null, 'Pro at a Basic+ price for one term');
select test.ok((select count(*) = 1 from public.console_deals(current_setting('test.o')::uuid) where is_active), 'Only the newest deal is active');
reset role;
update public.subscriptions set current_period_end = now() - interval '1 day' where org_id = current_setting('test.o')::uuid;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f911', 'boss@other-visit.ng');
select test.ok((public.prepare_paystack_subscription('5ime-deal-2', 'pro', 5, 1, false, 0) ->> 'amount_kobo')::bigint = 5 * 450 * 100,
  'The custom price per staff member is charged');
reset role;
set role service_role;
select public.apply_paystack_payment('5ime-deal-2', 'success', (select amount_kobo from public.payments where reference = '5ime-deal-2'), 'NGN');
reset role;
select test.ok(public.org_seat_price(current_setting('test.o')::uuid, 'pro') = 600, 'After its one payment the normal Pro price applies again');
select test.ok(public.renewal_amount_kobo(current_setting('test.o')::uuid) = 5 * 600 * 100::bigint, 'and renewals go back to the normal price');

\echo '--- a deal ends on its date'
insert into public.price_deals (org_id, kind, percent_off, ends_at, starts_at) values (current_setting('test.o')::uuid, 'percent', 50, now() - interval '1 minute', now() - interval '2 years');
select test.ok(public.org_seat_price(current_setting('test.o')::uuid, 'pro') = 600 and (select total_kobo from public.org_term_quote(current_setting('test.o')::uuid, 'pro', 5, 1, 0)) = 300000,
  'An expired deal gives no discount');
set role authenticated;
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select public.console_set_deal(current_setting('test.o')::uuid, 'amount', 1000, null, 3, null, null, 'Small goodwill credit');
select public.console_end_deal(current_setting('test.o')::uuid, 'Client asked to stop');
select test.ok((select count(*) = 0 from public.console_deals(current_setting('test.o')::uuid) where is_active), 'Ending a deal stops it');

reset role;
select set_config('test.uid', '', false);
update public.subscriptions s set plan = a.plan, status = a.status, seats_paid = a.seats_paid, billing_interval_months = a.billing_interval_months,
  current_period_start = a.current_period_start, current_period_end = a.current_period_end, trial_ends_at = a.trial_ends_at
  from o_sub2 a where s.org_id = a.org_id;
delete from public.payments where reference like '5ime-deal-%';
delete from public.price_deals;
\o
\echo '✅ PRICE DEAL TESTS PASSED'
