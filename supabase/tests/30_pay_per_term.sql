-- 5ime: pay-per-term billing (default) and opt-in auto-renew rules.
-- Runs after 20_privacy_billing_corrections.sql (Acme is on an active Basic term, ~29 days left).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
create table test.snap as
  select s.current_period_end as old_end, s.seats_paid as seats
    from subscriptions s join organizations o on o.id = s.org_id where o.domain = 'acme.ng';
grant select on test.snap to authenticated, service_role;
grant usage on schema test to service_role;
grant execute on all functions in schema test to service_role;
grant select on all tables in schema public to service_role; -- as on real Supabase

\echo '--- Pay per term (no automatic charge by default)'
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.blocked($$select prepare_paystack_subscription('5ime-ppt-0', 'pro', (select seats from test.snap), 1)$$,
                    'same plan', 'Paying ahead must stay on the current plan');
select test.blocked($$select prepare_paystack_subscription('5ime-ppt-0', 'basic', (select seats from test.snap), 3, true)$$,
                    'switched on when the current paid term ends', 'Auto-renew cannot start in the middle of a paid term');
select test.ok((prepare_paystack_subscription('5ime-ppt-1', 'basic', (select seats from test.snap), 3) ->> 'amount_kobo')::bigint
               = (select seats from test.snap) * 250 * 3 * 100, 'Admin can pay ahead for 3 months; amount = seats × ₦250 × 3');
select test.blocked($$select prepare_paystack_subscription('5ime-ppt-2', 'basic', (select seats from test.snap), 1)$$,
                    'already pending', 'Only one pending payment at a time');

reset role;
set role service_role;
select test.ok((apply_paystack_payment('5ime-ppt-1', 'success', (select amount_kobo from payments where reference = '5ime-ppt-1'), 'NGN') ->> 'manual')::boolean,
               'Verified one-off payment is applied as a manual term');
select test.ok((select current_period_start = (select old_end from test.snap)
                   and current_period_end = (select old_end from test.snap) + interval '3 months'
                   and paystack_subscription_code is null and status = 'active'
                from subscriptions s join organizations o on o.id = s.org_id where o.domain = 'acme.ng'),
               'Paid-ahead term starts when the current term ends and runs 3 months');
select test.ok(apply_paystack_payment('5ime-ppt-1', 'success', (select amount_kobo from payments where reference = '5ime-ppt-1'), 'NGN') ->> 'reason' = 'already applied',
               'Replaying the same payment does not extend the term twice');
select test.ok(apply_paystack_payment('5ime-random-ref', 'success', 75000, 'NGN') ->> 'reason' = 'no matching pending payment or subscription',
               'A successful but unknown payment reference is ignored');

\echo '--- Seat top-up without auto-renew'
reset role;
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.ok((prepare_paystack_seat_increase('5ime-seat-1', (select seats from test.snap) + 2) ->> 'amount_kobo')::bigint = 2 * 250 * 3 * 100,
               'Added seats cost the full price for the term: 2 × ₦250 × 3 months');
reset role;
set role service_role;
select test.ok((apply_paystack_payment('5ime-seat-1', 'success', (select amount_kobo from payments where reference = '5ime-seat-1'), 'NGN') ->> 'ok')::boolean,
               'Verified seat payment is applied');
select test.ok((select renewal_sync_status = 'not_required' from payments where reference = '5ime-seat-1'),
               'Manual-term seat top-up needs no Paystack plan update');
select test.ok((select seats_paid = (select seats from test.snap) + 2 from subscriptions s join organizations o on o.id = s.org_id where o.domain = 'acme.ng'),
               'Paid seat limit goes up immediately');

\echo '--- Opt-in auto-renew'
reset role;
update subscriptions s set current_period_start = now() - interval '40 days', current_period_end = now() - interval '5 days'
  from organizations o where o.id = s.org_id and o.domain = 'acme.ng';
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.ok((prepare_paystack_subscription('5ime-auto-1', 'pro', (select seats from test.snap) + 2, 1, true) ->> 'auto_renew')::boolean,
               'After the term ends, the admin can choose automatic renewal');
reset role;
update payments set status = 'failed' where reference = '5ime-auto-1';
update subscriptions s set paystack_subscription_code = 'SUB_test', cancel_at_period_end = false,
  current_period_end = now() + interval '20 days'
  from organizations o where o.id = s.org_id and o.domain = 'acme.ng';
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.blocked($$select prepare_paystack_subscription('5ime-ppt-9', 'basic', (select seats from test.snap) + 2, 1)$$,
                    'Automatic renewal is on', 'No manual payment while automatic renewal is on (prevents double charging)');

