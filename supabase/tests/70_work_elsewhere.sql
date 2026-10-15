-- 5ime: line managers, work-elsewhere requests, leaving-location detection.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
insert into auth.users values
  ('00000000-0000-0000-0000-00000000a701'),   -- owner@wfe.ng
  ('00000000-0000-0000-0000-00000000a702'),   -- lm@wfe.ng (line manager)
  ('00000000-0000-0000-0000-00000000a703'),   -- ada@wfe.ng (staff)
  ('00000000-0000-0000-0000-00000000a704');   -- other@wfe.ng (another manager, not Ada's)
set role authenticated;

select test.as_user('00000000-0000-0000-0000-00000000a701', 'owner@wfe.ng');
select public.create_organization('WFE Ltd');
insert into public.locations (org_id, name, lat, lng, radius_m, address)
  values (public.my_org_id(), 'VI Office', 6.4281, 3.4219, 150, 'Adeola Odeku St, Victoria Island, Lagos');
select public.invite_member('lm@wfe.ng', 'Line Manager', 'manager');
select public.invite_member('ada@wfe.ng', 'Ada', 'staff');
select public.invite_member('other@wfe.ng', 'Other Manager', 'manager');
select test.as_user('00000000-0000-0000-0000-00000000a702', 'lm@wfe.ng');    select join_organization();
select test.as_user('00000000-0000-0000-0000-00000000a703', 'ada@wfe.ng');   select join_organization();
select test.as_user('00000000-0000-0000-0000-00000000a704', 'other@wfe.ng'); select join_organization();

-- every day is an office day; no late/early noise
reset role;
update public.schedules set mode = 'office' where org_id = (select id from public.organizations where domain = 'wfe.ng');
update public.organizations set work_start = '00:00', work_end = '00:00', grace_minutes = 0 where domain = 'wfe.ng';
set role authenticated;

\echo '--- line managers'
select test.as_user('00000000-0000-0000-0000-00000000a703', 'ada@wfe.ng');
select test.blocked($$select public.set_line_manager((select id from members where email='ada@wfe.ng'), (select id from members where email='lm@wfe.ng'))$$,
  'Only admins', 'Staff cannot set line managers');
select test.as_user('00000000-0000-0000-0000-00000000a701', 'owner@wfe.ng');
select test.blocked($$select public.set_line_manager((select id from members where email='ada@wfe.ng'), (select id from members where email='ada@wfe.ng'))$$,
  'own line manager', 'A person cannot manage themselves');
select public.set_line_manager((select id from members where email='ada@wfe.ng'), (select id from members where email='lm@wfe.ng'));
select test.ok((select m.line_manager_id = (select id from members where email='lm@wfe.ng') from members m where email='ada@wfe.ng'),
  'Admin sets Ada''s line manager');

\echo '--- rejected: checked out at the time she asked'
select test.as_user('00000000-0000-0000-0000-00000000a703', 'ada@wfe.ng');
select test.ok((select location_type from public.check_in('in', 6.4282, 3.4220, 10)) = 'office', 'Ada checks in at the office');
reset role;   -- pretend she checked in at 09:00 (4 hours ago)
update public.attendance set at = now() - interval '4 hours' where member_id = (select id from public.members where email='ada@wfe.ng');
set role authenticated;
select test.ok(public.request_work_elsewhere(6.6018, 3.3515, 12, 'Client meeting in Ikeja', 'Client HQ', 'Allen Ave, Ikeja') is not null,
  'Ada asks to work at the client office');
select test.blocked($$select public.request_work_elsewhere(6.6, 3.35, 12, 'Again')$$, 'already have a request', 'Only one waiting request at a time');
select test.ok((select count(*) from public.work_location_requests) = 1, 'Ada sees her own request');

select test.as_user('00000000-0000-0000-0000-00000000a704', 'other@wfe.ng');
select test.ok((select count(*) from public.work_location_requests) = 0, 'Another manager cannot see Ada''s request');
select test.blocked($$select public.decide_work_elsewhere((select id from public.work_location_requests limit 1), true)$$,
  'Request not found', 'Another manager cannot decide it');

select test.as_user('00000000-0000-0000-0000-00000000a702', 'lm@wfe.ng');
select test.ok((select count(*) from public.work_location_requests where status = 'pending') = 1, 'Line manager sees the waiting request');
select test.blocked($$select public.decide_work_elsewhere((select id from public.work_location_requests limit 1), false)$$,
  'reason for rejecting', 'Rejecting needs a reason');
reset role;  -- the decision comes two hours later than the request
update public.work_location_requests set requested_at = now() - interval '2 hours', effective_from = now() - interval '2 hours';
set role authenticated;
select public.decide_work_elsewhere((select id from public.work_location_requests limit 1), false, 'Not agreed in advance');

reset role;
select test.ok((select count(*) from public.attendance a join public.members m on m.id = a.member_id
                 where m.email = 'ada@wfe.ng' and a.kind = 'out' and 'left_unapproved' = any(a.flags)
                   and abs(extract(epoch from (a.at - (now() - interval '2 hours')))) < 5) = 1,
  'Rejected → Ada is checked out at the time she asked (not the decision time)');
select test.ok((select checkout_attendance_id is not null and status = 'rejected' from public.work_location_requests),
  'The request links to the automatic check-out');
set role authenticated;

\echo '--- approved: the session carries on and the place counts'
select test.as_user('00000000-0000-0000-0000-00000000a703', 'ada@wfe.ng');
select test.ok((select location_type from public.check_in('in', 6.4282, 3.4220, 10)) = 'office', 'Ada checks in again at the office');
select public.request_work_elsewhere(6.5244, 3.3792, 15, 'Site visit at Yaba', 'Yaba site', 'Herbert Macaulay Way, Yaba');
select test.as_user('00000000-0000-0000-0000-00000000a701', 'owner@wfe.ng');   -- admins can decide too
select public.decide_work_elsewhere((select id from public.work_location_requests where status = 'pending'), true, null);
select test.as_user('00000000-0000-0000-0000-00000000a703', 'ada@wfe.ng');
select test.ok((select kind from public.attendance where member_id = public.my_member_id() order by at desc limit 1) = 'in',
  'Approved → no automatic check-out, the session continues');
select test.ok((public.report_presence(6.5245, 3.3793, 20) ->> 'status') = 'inside', 'At the approved place, the 15-minute check says inside');
select test.ok((select location_type from public.check_in('out', 6.5245, 3.3793, 10)) = 'elsewhere', 'Checking out there is recorded as an approved place');
select test.ok((select not ('wrong_location' = any(flags) or 'out_of_range' = any(flags)) from public.attendance
                 where member_id = public.my_member_id() order by at desc limit 1), 'No wrong-place flag at an approved place');

\echo '--- left without asking: detected, manager ends the session at that time'
select public.check_in('in', 6.4282, 3.4220, 10);
select test.ok((public.report_presence(6.4282, 3.4220, 15) ->> 'status') = 'inside', 'Still at the office → inside');
select test.ok((public.report_presence(6.6018, 3.3515, 15) ->> 'status') = 'outside', 'Moved away → outside is recorded');
select test.ok((public.report_presence(6.4282, 3.4220, 900) ->> 'status') = 'weak_signal', 'A weak GPS reading is not used as evidence');
select test.ok((select count(*) from public.presence_departures where member_id = public.my_member_id()) = 1, 'One departure per session');
select test.blocked($$select public.end_session_at_departure((select id from public.presence_departures where resolution is null))$$,
  'cannot end your own', 'Staff cannot close their own session this way');
select test.as_user('00000000-0000-0000-0000-00000000a702', 'lm@wfe.ng');
select test.ok((select count(*) from public.presence_departures where resolution is null) = 1, 'Line manager sees the departure');
select public.end_session_at_departure((select id from public.presence_departures where resolution is null));
reset role;
select test.ok((select a.kind = 'out' and 'left_unapproved' = any(a.flags) from public.attendance a
                 join public.members m on m.id = a.member_id where m.email = 'ada@wfe.ng' order by a.at desc limit 1),
  'Session ended at the time she left, flagged');
set role authenticated;

\echo '--- departure then request: the request counts from when she left'
select test.as_user('00000000-0000-0000-0000-00000000a703', 'ada@wfe.ng');
select public.check_in('in', 6.4282, 3.4220, 10);
select public.report_presence(6.6018, 3.3515, 15);
reset role;
update public.presence_departures set departed_at = now() - interval '30 minutes' where resolution is null;
set role authenticated;
select public.request_work_elsewhere(6.6018, 3.3515, 15, 'Had to go to the client');
select test.ok((select abs(extract(epoch from (effective_from - (now() - interval '30 minutes')))) < 5
                  from public.work_location_requests where status = 'pending'), 'Request starts from when she was seen leaving');
select public.cancel_work_elsewhere((select id from public.work_location_requests where status = 'pending'));
select test.ok((select status from public.work_location_requests order by requested_at desc limit 1) = 'cancelled', 'Staff can cancel a waiting request');

\echo '--- home address follows approval'
select public.request_home_location(6.4474, 3.4720, 20, 'Admiralty Way, Lekki Phase 1');
select test.as_user('00000000-0000-0000-0000-00000000a701', 'owner@wfe.ng');
select public.review_home_location((select id from public.members where email = 'ada@wfe.ng'), true);
select test.ok((select home_address = 'Admiralty Way, Lekki Phase 1' and home_req_address is null
                  from public.member_private_locations where member_id = (select id from public.members where email='ada@wfe.ng')),
  'Approved home keeps its address');

reset role;
\o
\echo '✅ WORK-ELSEWHERE TESTS PASSED'
