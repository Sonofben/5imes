-- 5ime: leave management (migration 0021). Visit Ltd (Premium), Other Visit Ltd (Basic).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
select set_config('test.uid', '', false);
select set_config('test.v', (select id::text from public.organizations where domain = 'visit.ng'), false);
select set_config('test.ade', (select id::text from public.members where email = 'ade@visit.ng'), false);
select set_config('test.annual', (select id::text from public.leave_types where org_id = current_setting('test.v')::uuid and code = 'annual'), false);
delete from public.public_holidays where day between current_date + 10 and current_date + 40;
update public.members set start_date = current_date - interval '6 years', team = null where id = current_setting('test.ade')::uuid;

\echo '--- types and staff details'
select test.ok((select count(*) from public.leave_types where org_id = current_setting('test.v')::uuid) = 7, 'Every company starts with the seven standard leave types');
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select test.ok(public.admin_set_staff_details(jsonb_build_array(jsonb_build_object('member_id', current_setting('test.ade'), 'birth_month', 3, 'birth_day', 14))) = 1,
  'An admin imports staff details in bulk');
select test.blocked(format($$select public.admin_set_staff_details('[{"member_id":"%s","birth_month":2,"birth_day":30}]')$$, current_setting('test.ade')),
  'not a real date', 'Impossible birthdays are refused');
select test.ok(public.admin_save_leave_type(null, 'Study leave', true, 5, false, true, null, 'none', null, null, true) is not null, 'Pro and Premium can add their own leave type');
select test.blocked($$select public.admin_save_leave_type(null, 'study leave', true, 5, false, true, null, 'none', null, null, true)$$, 'already have', 'Names are unique');

\echo '--- asking for leave'
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select test.ok((select birth_month = 3 from public.member_private_details), 'Staff can read their own birthday');
select set_config('test.r1', public.request_leave(current_setting('test.annual')::uuid, current_date + 10, current_date + 14, 'Family trip')::text, false);
select test.ok((select days = public.leave_days(member_id, leave_type_id, start_date, end_date) and status = 'pending' from public.leave_requests where id = current_setting('test.r1')::uuid),
  'A request counts working days and waits for approval');
select test.ok((select (b ->> 'pending')::numeric > 0 from jsonb_array_elements(public.my_leave_balances()) b where b ->> 'type_id' = current_setting('test.annual')),
  'Pending days show in the balance');
select test.blocked(format($$select public.request_leave(%L, current_date + 12, current_date + 13, null)$$, current_setting('test.annual')), 'already have leave', 'Overlapping leave is refused');
select test.blocked(format($$select public.request_leave(%L, current_date + 20, current_date + 40, null)$$, current_setting('test.annual')), 'left', 'More days than the balance is refused');
select test.blocked(format($$select public.decide_leave(%L, true, null)$$, current_setting('test.r1')), 'approve your own leave', 'Nobody approves their own leave');
select test.ok((select count(*) from public.leave_rules) = 0, 'Staff cannot see the leave rules');

\echo '--- approving'
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select public.decide_leave(current_setting('test.r1')::uuid, true, 'Enjoy');
select test.ok((select status = 'approved' from public.leave_requests where id = current_setting('test.r1')::uuid), 'An admin approves');
select test.ok(public.on_leave(current_setting('test.ade')::uuid, current_date + 11) = 'Annual leave', 'The person is on leave those days');
reset role;
select set_config('test.uid', '', false);
select test.ok(position('on_leave' in pg_get_functiondef('public.try_auto_check_in(uuid)'::regprocedure)) > 0, 'No automatic check-in while on leave');

\echo '--- allowances without one-by-one work'
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select test.ok(((select b from jsonb_array_elements(public.admin_leave_overview(current_setting('test.annual')::uuid)) b where b ->> 'member_id' = current_setting('test.ade')) ->> 'entitlement')::numeric = 20, 'The company default applies');
select public.admin_save_leave_rule(current_setting('test.annual')::uuid, null, null, 5, 25);
select test.ok(((select b from jsonb_array_elements(public.admin_leave_overview(current_setting('test.annual')::uuid)) b where b ->> 'member_id' = current_setting('test.ade')) ->> 'entitlement')::numeric = 25,
  'A years-of-service rule raises it automatically');
select public.admin_set_allowances(jsonb_build_array(jsonb_build_object('member_id', current_setting('test.ade'), 'leave_type_id', current_setting('test.annual'), 'days', 12)), 'Agreed in contract');
select test.ok(((select b from jsonb_array_elements(public.admin_leave_overview(current_setting('test.annual')::uuid)) b where b ->> 'member_id' = current_setting('test.ade')) ->> 'entitlement')::numeric = 12,
  'A bulk or one-person allowance wins over rules');
select public.admin_set_allowances(jsonb_build_array(jsonb_build_object('member_id', current_setting('test.ade'), 'leave_type_id', current_setting('test.annual'), 'days', null)));
select test.ok(((select b from jsonb_array_elements(public.admin_leave_overview(current_setting('test.annual')::uuid)) b where b ->> 'member_id' = current_setting('test.ade')) ->> 'entitlement')::numeric = 25,
  'Removing it goes back to the rules');
select public.admin_save_leave_type(current_setting('test.annual')::uuid, 'Annual leave', true, 20, false, true, null, 'limited', 5, null, true);
select test.ok(((select b from jsonb_array_elements(public.admin_leave_overview(current_setting('test.annual')::uuid)) b where b ->> 'member_id' = current_setting('test.ade')) ->> 'carried')::numeric = 5,
  'Unused days carry over up to the limit');
select public.admin_save_leave_type(current_setting('test.annual')::uuid, 'Annual leave', true, 20, false, true, null, 'none', null, null, true);
select test.ok(((select b from jsonb_array_elements(public.admin_leave_overview(current_setting('test.annual')::uuid)) b where b ->> 'member_id' = current_setting('test.ade')) ->> 'carried')::numeric = 0,
  'With no carry-over, unused days are lost');
select test.ok(jsonb_array_length(public.admin_leave_overview(current_setting('test.annual')::uuid)) >= 2, 'Admins see everyone''s balance');

\echo '--- Basic'
select test.as_console('00000000-0000-0000-0000-00000000f911', 'boss@other-visit.ng');
select test.blocked($$select public.admin_save_leave_type(null, 'Gym leave', true, 2, false, true, null, 'none', null, null, true)$$, 'Pro and Premium', 'Basic cannot add leave types');
select test.blocked($$select public.admin_set_allowances('[]')$$, 'Pro and Premium', 'or set allowances per person');
select test.ok((select count(*) from public.leave_requests) = 0 and (select count(*) from public.member_private_details) = 0,
  'Another company sees none of Visit Ltd''s leave or birthdays');
reset role;
select set_config('test.uid', '', false);
delete from public.leave_requests where member_id = current_setting('test.ade')::uuid;
delete from public.leave_rules where org_id = current_setting('test.v')::uuid;

\o
\echo '✅ LEAVE TESTS PASSED'
