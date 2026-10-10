-- 5ime: privacy, billing-ledger, seat-cap and attendance-correction tests.
-- Runs after 10_attendance_rules.sql in the same session (reuses its companies and people).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
insert into auth.users values ('00000000-0000-0000-0000-00000000000f'); -- mgr@acme.ng
update subscriptions s set trial_ends_at = now() + interval '7 days'
  from organizations o where o.id = s.org_id and o.domain = 'acme.ng';
set role authenticated;

\echo '--- Manager privacy'
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select invite_member('mgr@acme.ng', 'Mgr', 'manager');
select test.as_user('00000000-0000-0000-0000-00000000000f', 'mgr@acme.ng');
select test.ok(join_organization() ->> 'role' = 'manager', 'Invited manager joins with the manager role');
select test.ok((select count(*) from attendance) > 0, 'Manager can read attendance times and places');
select test.ok((select count(*) from member_private_locations) = 0, 'Manager cannot read staff home coordinates');
select test.ok((select count(*) from private_attendance_locations) = 0, 'Manager cannot read exact check-in GPS');
select test.blocked($$select ip from attendance$$, 'permission denied', 'Manager cannot read staff IP addresses');
select test.blocked($$select user_agent from attendance$$, 'permission denied', 'Manager cannot read staff device details');
select test.blocked($$select * from attendance_device_info(current_date - 30, current_date)$$, 'Only admins', 'Manager cannot call the device-details report');
select test.blocked($$select * from payments$$, 'permission denied', 'Manager cannot read the payment ledger');

\echo '--- Admin privacy and billing ledger'
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.ok((select count(*) from attendance_device_info(current_date - 30, current_date)) > 0, 'Admin can read device details for their own company');
select test.ok((select count(*) from private_attendance_locations) > 0, 'Admin can read exact check-in GPS for their own company');
select test.blocked($$select * from payments$$, 'permission denied', 'Payment ledger is server-only, even for admins');
select test.blocked($$select apply_paystack_payment('x', 'success', 100, 'NGN')$$, 'permission denied', 'Admin cannot mark a payment as applied');
select test.blocked($$select record_paystack_subscription('PLN_x', 'SUB_x', null, null)$$, 'permission denied', 'Admin cannot attach a Paystack subscription');

select test.as_user('00000000-0000-0000-0000-00000000000e', 'ceo@other.ng');
select test.ok((select count(*) from attendance_device_info(current_date - 30, current_date)) = 0, 'Another company sees none of Acme''s device details');

select test.as_user('00000000-0000-0000-0000-00000000000b', 'tunde@acme.ng');
select test.blocked($$select prepare_paystack_subscription('5ime-test-1', 'pro', 5, 1)$$, 'admins', 'Staff cannot start a subscription checkout');

\echo '--- Attendance corrections'
select test.ok(request_attendance_correction(
  ((now() at time zone 'Africa/Lagos')::date - 1), '08:00', '17:00', 'Phone died, I was at the office all day.') is not null,
  'Staff can request a correction for a past day');
select test.blocked($$select request_attendance_correction(((now() at time zone 'Africa/Lagos')::date - 1), '08:05', null, 'Second request for the same day.')$$,
  'already waiting', 'Only one pending correction per day');
select test.blocked($$select request_attendance_correction(((now() at time zone 'Africa/Lagos')::date + 1), '08:00', null, 'Requesting a future day correction.')$$,
  'today or earlier', 'Corrections for future days are refused');
select test.blocked($$insert into attendance_correction_requests (org_id, member_id, work_date, requested_in_at, reason)
                      select org_id, id, current_date, now(), 'Direct insert attempt here' from members$$,
                    'permission denied', 'Staff cannot write correction requests directly');
select test.blocked($$select review_attendance_correction((select id from attendance_correction_requests limit 1), true)$$,
                    'manager or admin', 'Staff cannot approve corrections');

select test.as_user('00000000-0000-0000-0000-00000000000f', 'mgr@acme.ng');
select request_attendance_correction(((now() at time zone 'Africa/Lagos')::date - 2), '08:30', null, 'Forgot to check in that morning.');
select test.blocked($$select review_attendance_correction((select r.id from attendance_correction_requests r join members m on m.id = r.member_id where m.email = 'mgr@acme.ng'), true)$$,
                    'your own correction', 'Manager cannot approve their own correction');

select test.as_user('00000000-0000-0000-0000-00000000000e', 'ceo@other.ng');
select test.ok((select count(*) from attendance_correction_requests) = 0, 'Another company cannot see Acme''s correction requests');

select test.as_user('00000000-0000-0000-0000-00000000000f', 'mgr@acme.ng');
select review_attendance_correction((select r.id from attendance_correction_requests r join members m on m.id = r.member_id where m.email = 'tunde@acme.ng'), true, 'Confirmed with team lead');
select test.ok((select count(*) from attendance a join members m on m.id = a.member_id
                where m.email = 'tunde@acme.ng' and 'corrected' = any(a.flags)) = 2, 'Approved correction adds corrected check-in and check-out');
select test.ok((select count(*) from attendance_correction_audit a join attendance_correction_requests r on r.id = a.request_id
                join members m on m.id = r.member_id where m.email = 'tunde@acme.ng') = 2, 'Correction leaves an audit trail (submitted + approved)');
select test.blocked($$select review_attendance_correction((select r.id from attendance_correction_requests r join members m on m.id = r.member_id where m.email = 'tunde@acme.ng'), false)$$,
                    'already been reviewed', 'A reviewed correction cannot be reviewed again');

\echo '--- Paid seat limit'
reset role;
update subscriptions s set status = 'active', seats_paid = (select count(*) from members m where m.org_id = s.org_id and m.status in ('active','invited')),
  current_period_start = now() - interval '1 day', current_period_end = now() + interval '29 days'
  from organizations o where o.id = s.org_id and o.domain = 'acme.ng';
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.blocked($$select invite_member('extra@acme.ng', 'Extra')$$, 'paid seats are full', 'Invites stop when paid seats are full');
select test.blocked($$select invite_members_bulk('[{"email":"a1@acme.ng"},{"email":"a2@acme.ng"}]'::jsonb)$$, 'paid-seat limit', 'Bulk import stops when paid seats are full');

reset role;
update subscriptions s set plan = 'basic' from organizations o where o.id = s.org_id and o.domain = 'acme.ng';
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.blocked($$select replace_schedule(my_org_id(), (select id from members where email = 'tunde@acme.ng'), '[{"weekday":1,"mode":"home"}]'::jsonb)$$,
                    'Pro feature', 'Per-person schedules need the Pro plan');
reset role;
select set_config('test.other_org', (select id::text from organizations where domain = 'other.ng'), false);
set role authenticated;
select test.blocked($$select replace_schedule(current_setting('test.other_org')::uuid, null, '[{"weekday":1,"mode":"off"}]'::jsonb)$$,
                    'Only this company', 'Admin cannot change another company''s schedule');
select test.blocked($$select replace_schedule(null, null, '[{"weekday":1,"mode":"off"}]'::jsonb)$$,
                    'Only this company', 'Schedule change with no company is refused');

\o
\echo ''
\echo '✅ ALL DATABASE TESTS PASSED'
