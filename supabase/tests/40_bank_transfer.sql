-- 5ime: bank-transfer payments recorded by Kora Forge staff (SQL Editor, superuser/service role).
-- Runs after 30_pay_per_term.sql (Acme: Basic, auto-renew ON, term ends in ~20 days).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

\echo '--- Bank transfer (staff only)'
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.blocked($$select record_bank_transfer('acme.ng', 'basic', 50, 1, 12500, 'X1')$$, 'permission denied', 'Company admins cannot record bank transfers themselves');
reset role;

select test.blocked($$select record_bank_transfer('acme.ng', 'basic', (select seats_paid from subscriptions s join organizations o on o.id = s.org_id where o.domain = 'acme.ng'), 1, 1, 'FBN-1')$$,
                    'automatic card renewal on', 'Transfer cannot be recorded while card auto-renew is on');
update subscriptions s set cancel_at_period_end = true from organizations o where o.id = s.org_id and o.domain = 'acme.ng';
create temp table snap2 as select s.seats_paid as seats, s.current_period_end as old_end
  from subscriptions s join organizations o on o.id = s.org_id where o.domain = 'acme.ng';

select test.blocked($$select record_bank_transfer('unknown.ng', 'basic', 5, 1, 1250, 'FBN-0')$$, 'No company', 'Unknown company domain is refused');
select test.blocked($$select record_bank_transfer('acme.ng', 'basic', (select seats from snap2), 3, 1, 'FBN-2')$$, 'Amount should be', 'Wrong transfer amount is refused');
select test.ok((record_bank_transfer('acme.ng', 'basic', (select seats from snap2), 3, (select seats from snap2) * 250 * 3, 'FBN 0042/77') ->> 'ok')::boolean,
               'Correct transfer activates the next 3-month term');
select test.ok((select current_period_start = (select old_end from snap2) and current_period_end = (select old_end from snap2) + interval '3 months'
                   and paystack_subscription_code is null
                from subscriptions s join organizations o on o.id = s.org_id where o.domain = 'acme.ng'),
               'Transferred term starts when the current term ends');
select test.ok((select status = 'applied' from payments where reference = 'bank-FBN004277'), 'Transfer appears in payment history as paid (receipt available)');
select test.blocked($$select record_bank_transfer('acme.ng', 'basic', (select seats from snap2), 3, (select seats from snap2) * 250 * 3, 'FBN-0042/77')$$,
                    'already been recorded', 'The same bank reference cannot be recorded twice');

select test.blocked($$select record_bank_transfer_seats('acme.ng', (select seats from snap2) + 1, 1, 'FBN-5')$$, 'Amount should be', 'Seat top-up with wrong amount is refused');
select test.ok((record_bank_transfer_seats('acme.ng', (select seats from snap2) + 1, 250 * 3, 'FBN-6') ->> 'ok')::boolean,
               'Seat top-up by transfer: 1 seat × ₦250 × 3 months (no proration)');
select test.ok((select seats_paid = (select seats from snap2) + 1 from subscriptions s join organizations o on o.id = s.org_id where o.domain = 'acme.ng'),
               'Paid seat limit goes up after the seat transfer');

\o
\echo ''
\echo '✅ ALL DATABASE TESTS PASSED'
