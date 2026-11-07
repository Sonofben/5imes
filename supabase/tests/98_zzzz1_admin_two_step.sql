-- 5ime: owners and admins need two-step sign-in (aal2) for admin data in the database (0033).
-- Managers and reception staff keep their access on a password-only session.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
insert into auth.users values
  ('00000000-0000-0000-0000-0000000a2001'),  -- owner@twostep.ng
  ('00000000-0000-0000-0000-0000000a2002'),  -- admin@twostep.ng
  ('00000000-0000-0000-0000-0000000a2003'),  -- manager@twostep.ng
  ('00000000-0000-0000-0000-0000000a2004');  -- desk@twostep.ng (staff with reception access)
set role authenticated;
select test.as_user_sess('00000000-0000-0000-0000-0000000a2001', 'owner@twostep.ng', 'aal2');
select public.create_organization('Two Step Ltd');
reset role;
insert into public.members (org_id, user_id, email, full_name, role, status, can_reception)
  select id, '00000000-0000-0000-0000-0000000a2002'::uuid, 'admin@twostep.ng', 'Admin', 'admin', 'active', false from public.organizations where domain = 'twostep.ng'
  union all
  select id, '00000000-0000-0000-0000-0000000a2003'::uuid, 'manager@twostep.ng', 'Manager', 'manager', 'active', false from public.organizations where domain = 'twostep.ng'
  union all
  select id, '00000000-0000-0000-0000-0000000a2004'::uuid, 'desk@twostep.ng', 'Desk', 'staff', 'active', true from public.organizations where domain = 'twostep.ng';
set role authenticated;

\echo '--- owner and admin on a password-only session are not admins in the database'
select test.as_user_sess('00000000-0000-0000-0000-0000000a2001', 'owner@twostep.ng', 'aal1');
select test.ok(not public.is_org_admin(), 'Owner without two-step is not an admin');
select test.ok(not public.is_org_viewer(), 'Owner without two-step is not a viewer');
select test.ok(not public.is_visitor_desk(), 'Owner without two-step has no visitor desk');
select test.ok((select count(*) from public.subscriptions) = 0, 'Owner without two-step cannot read billing');
select test.blocked($q$select * from public.attendance_device_info(current_date - 7, current_date)$q$,
  'Only admins', 'Owner without two-step cannot read IP and device details');
select test.ok((select count(*) from public.members where user_id = '00000000-0000-0000-0000-0000000a2001') = 1,
  'Owner without two-step still reads their own member row (for /app)');
select test.ok((select count(*) from public.members) = 1, 'Owner without two-step sees only their own member row');

select test.as_user_sess('00000000-0000-0000-0000-0000000a2002', 'admin@twostep.ng', 'aal1');
select test.ok(not public.is_org_admin(), 'Admin without two-step is not an admin');
update public.organizations set grace_minutes = 31 where domain = 'twostep.ng';
reset role;
select test.ok((select grace_minutes from public.organizations where domain = 'twostep.ng') <> 31,
  'Admin without two-step cannot change company settings');
set role authenticated;

\echo '--- with two-step sign-in they are admins again'
select test.as_user_sess('00000000-0000-0000-0000-0000000a2001', 'owner@twostep.ng', 'aal2');
select test.ok(public.is_org_admin(), 'Owner with two-step is an admin');
select test.ok(public.is_org_viewer(), 'Owner with two-step is a viewer');
select test.ok(public.is_visitor_desk(), 'Owner with two-step has the visitor desk');
select test.ok((select count(*) from public.subscriptions) = 1, 'Owner with two-step reads billing');
select test.ok((select count(*) from public.members) = 4, 'Owner with two-step sees every member');
select test.as_user_sess('00000000-0000-0000-0000-0000000a2002', 'admin@twostep.ng', 'aal2');
select test.ok(public.is_org_admin(), 'Admin with two-step is an admin');
update public.organizations set grace_minutes = 31 where domain = 'twostep.ng';
reset role;
select test.ok((select grace_minutes from public.organizations where domain = 'twostep.ng') = 31,
  'Admin with two-step can change company settings');
set role authenticated;

\echo '--- recovery-code window: same session, within 10 minutes only'
reset role;
insert into public.member_security_events (org_id, member_id, user_id, kind, session_id, created_at)
  select m.org_id, m.id, m.user_id, 'recovery_used', '00000000-0000-0000-0000-0000000a2e01', now() - interval '2 minutes'
    from public.members m where m.user_id = '00000000-0000-0000-0000-0000000a2002';
insert into public.member_security_events (org_id, member_id, user_id, kind, session_id, created_at)
  select m.org_id, m.id, m.user_id, 'recovery_used', '00000000-0000-0000-0000-0000000a2e02', now() - interval '11 minutes'
    from public.members m where m.user_id = '00000000-0000-0000-0000-0000000a2002';
set role authenticated;
select test.as_user_sess('00000000-0000-0000-0000-0000000a2002', 'admin@twostep.ng', 'aal1', '00000000-0000-0000-0000-0000000a2e01');
select test.ok(public.is_org_admin(), 'Recovery code used in this session in the last 10 minutes counts');
select test.as_user_sess('00000000-0000-0000-0000-0000000a2002', 'admin@twostep.ng', 'aal1', '00000000-0000-0000-0000-0000000a2e03');
select test.ok(not public.is_org_admin(), 'A recovery code used in another session does not count');
select test.as_user_sess('00000000-0000-0000-0000-0000000a2002', 'admin@twostep.ng', 'aal1', '00000000-0000-0000-0000-0000000a2e02');
select test.ok(not public.is_org_admin(), 'A recovery code used more than 10 minutes ago does not count');

\echo '--- managers and reception staff are unchanged on a password-only session'
select test.as_user_sess('00000000-0000-0000-0000-0000000a2003', 'manager@twostep.ng', 'aal1');
select test.ok(public.is_org_viewer(), 'Manager without two-step is still a viewer');
select test.ok(public.is_visitor_desk(), 'Manager without two-step still has the visitor desk');
select test.ok(not public.is_org_admin(), 'Manager is not an admin');
select test.as_user_sess('00000000-0000-0000-0000-0000000a2004', 'desk@twostep.ng', 'aal1');
select test.ok(public.is_visitor_desk(), 'Reception staff without two-step keep the visitor desk');
select test.ok(not public.is_org_viewer(), 'Reception staff are not viewers');

\echo '--- signed-out visitors are nothing'
select set_config('test.uid', '', false);
select set_config('test.jwt', '{}', false);
select test.ok(not public.is_org_admin() and not public.is_org_viewer() and not public.is_visitor_desk(), 'Signed out: no admin, viewer or desk');

\o
\echo '✅ ADMIN TWO-STEP TESTS PASSED'
