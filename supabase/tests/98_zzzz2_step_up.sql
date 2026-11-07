-- 5ime: a fresh two-step code before sensitive actions (0034).
-- Blocked without a fresh code, allowed with one in the same session, blocked again after 5 minutes.
-- Uses the Two Step Ltd company from 98_zzzz1_admin_two_step.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
insert into auth.users values ('00000000-0000-0000-0000-0000000a2005');  -- leaver@twostep.ng
insert into public.members (org_id, user_id, email, full_name, role, status)
  select id, '00000000-0000-0000-0000-0000000a2005'::uuid, 'leaver@twostep.ng', 'Leaver', 'staff', 'active'
    from public.organizations where domain = 'twostep.ng';
set role authenticated;

\echo '--- nobody can record or read step-up codes from the browser'
select test.as_user_sess('00000000-0000-0000-0000-0000000a2001', 'owner@twostep.ng', 'aal2', '00000000-0000-0000-0000-0000000a2501');
select test.blocked($q$select public.record_step_up('00000000-0000-0000-0000-0000000a2001', '00000000-0000-0000-0000-0000000a2501')$q$,
  'permission denied', 'A signed-in user cannot record their own step-up');
select test.blocked($q$select count(*) from public.step_up_verifications$q$, 'permission denied', 'A signed-in user cannot read step-up records');
select test.blocked($q$insert into public.step_up_verifications (user_id, session_id) values ('00000000-0000-0000-0000-0000000a2001', '00000000-0000-0000-0000-0000000a2501')$q$,
  'permission denied', 'A signed-in user cannot insert step-up records');

\echo '--- without a fresh code: blocked'
select test.ok(not public.step_up_fresh(), 'Two-step session alone is not a fresh code');
select test.blocked($q$select public.require_step_up()$q$, 'fresh code', 'require_step_up refuses');
delete from public.members where email = 'leaver@twostep.ng';
reset role;
select test.ok(exists (select 1 from public.members where email = 'leaver@twostep.ng'), 'Removing a person is blocked without a fresh code');
set role authenticated;
select test.blocked($q$select * from public.vms_forget_visitor('someone@example.com')$q$, 'fresh code', 'Erasing a visitor is blocked without a fresh code');
select test.blocked($q$select public.vms_log_export(current_date - 7, current_date)$q$, 'fresh code', 'Owner''s visitor export is blocked without a fresh code');
select test.as_user_sess('00000000-0000-0000-0000-0000000a2003', 'manager@twostep.ng', 'aal1');
select public.vms_log_export(current_date - 7, current_date);
select test.ok(true, 'A manager''s visitor export is not asked for a code (managers don''t use two-step yet)');

\echo '--- with a fresh code in the same session: allowed'
reset role;
select public.record_step_up('00000000-0000-0000-0000-0000000a2001', '00000000-0000-0000-0000-0000000a2501');
set role authenticated;
select test.as_user_sess('00000000-0000-0000-0000-0000000a2001', 'owner@twostep.ng', 'aal2', '00000000-0000-0000-0000-0000000a2502');
select test.ok(not public.step_up_fresh(), 'A code typed in another session does not count');
select test.as_user_sess('00000000-0000-0000-0000-0000000a2001', 'owner@twostep.ng', 'aal2', '00000000-0000-0000-0000-0000000a2501');
select test.ok(public.step_up_fresh(), 'A code typed in this session in the last 5 minutes counts');
select public.vms_log_export(current_date - 7, current_date);
select test.ok(true, 'Owner''s visitor export works with a fresh code');
select test.ok((select count(*) from public.vms_forget_visitor('nobody-here@example.com')) = 0, 'Erasing a visitor works with a fresh code');
delete from public.members where email = 'leaver@twostep.ng';
reset role;
select test.ok(not exists (select 1 from public.members where email = 'leaver@twostep.ng'), 'Removing a person works with a fresh code');

\echo '--- after 5 minutes: blocked again'
update public.step_up_verifications set verified_at = now() - interval '6 minutes'
 where user_id = '00000000-0000-0000-0000-0000000a2001';
insert into auth.users values ('00000000-0000-0000-0000-0000000a2006');  -- leaver2@twostep.ng
insert into public.members (org_id, user_id, email, full_name, role, status)
  select id, '00000000-0000-0000-0000-0000000a2006'::uuid, 'leaver2@twostep.ng', 'Leaver Two', 'staff', 'active'
    from public.organizations where domain = 'twostep.ng';
set role authenticated;
select test.ok(not public.step_up_fresh(), 'A code from 6 minutes ago no longer counts');
select test.blocked($q$select public.vms_log_export(current_date - 7, current_date)$q$, 'fresh code', 'Export is blocked again after the window');
delete from public.members where email = 'leaver2@twostep.ng';
reset role;
select test.ok(exists (select 1 from public.members where email = 'leaver2@twostep.ng'), 'Removing a person is blocked again after the window');

\echo '--- Global Admin: export, delete and two-step reset need a fresh code'
delete from public.step_up_verifications where user_id = '00000000-0000-0000-0000-0000000000c1';
select set_config('test.tsorg', (select id::text from public.organizations where domain = 'twostep.ng'), false);
set role authenticated;
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select test.ok(not public.step_up_fresh(), 'Console session without a fresh code');
select test.blocked($q$select public.console_company_export(current_setting('test.tsorg')::uuid, 'Customer asked')$q$,
  'fresh code', 'Company export is blocked without a fresh code');
select test.blocked($q$select public.console_delete_company(current_setting('test.tsorg')::uuid, 'twostep.ng', 'Closing')$q$,
  'fresh code', 'Deleting a company is blocked without a fresh code');
select test.blocked($q$select public.console_reset_mfa('00000000-0000-0000-0000-0000000a2002', 'Phone lost')$q$,
  'fresh code', 'Resetting two-step is blocked without a fresh code');
reset role;
select public.record_step_up('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000c5e55');
set role authenticated;
select test.ok(public.console_company_export(current_setting('test.tsorg')::uuid, 'Customer asked') ? 'exported_at',
  'Company export works with a fresh code');
reset role;
update public.step_up_verifications set verified_at = now() - interval '6 minutes' where user_id = '00000000-0000-0000-0000-0000000000c1';
set role authenticated;
select test.blocked($q$select public.console_company_export(current_setting('test.tsorg')::uuid, 'Customer asked')$q$,
  'fresh code', 'Company export is blocked again after the window');

reset role;
\o
\echo '✅ STEP-UP TESTS PASSED'
