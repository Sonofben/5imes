-- 5ime: company links/branding, staff onboarding, Kora Forge console, support access, suspension.
-- Runs after 30_pay_per_term.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
insert into auth.users values ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000c2');
insert into platform_staff (user_id, email, role) values
  ('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com', 'owner'),
  ('00000000-0000-0000-0000-0000000000c2', 'helpdesk@koraforge.com', 'viewer');
create function test.as_console(uid text, email text, aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('test.uid', uid, false);
  perform set_config('test.jwt', json_build_object('email', email, 'aal', aal)::text, false);
end $$;
grant execute on function test.as_console(text, text, text) to authenticated;
grant usage on schema test to anon;
grant execute on all functions in schema test to anon;
-- start from an expired paid term so trial/complimentary actions are allowed
update subscriptions s set status = 'active', paystack_subscription_code = null, cancel_at_period_end = false,
  current_period_start = now() - interval '40 days', current_period_end = now() - interval '2 days'
  from organizations o where o.id = s.org_id and o.domain = 'acme.ng';
select set_config('test.acme', (select id::text from organizations where domain = 'acme.ng'), false);
set role authenticated;

\echo '--- Company link & branding'
reset role;
-- Brand colours need Pro or Premium (0017): put this company on Pro for the branding check, then restore it.
create temporary table acme_sub as select * from subscriptions where org_id = current_setting('test.acme')::uuid;
update subscriptions set plan = 'pro', status = 'active', trial_ends_at = null, current_period_end = now() + interval '30 days'
 where org_id = current_setting('test.acme')::uuid;
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.ok((select slug from organizations) = 'acme-ltd', 'Every company gets a link name from its name (acme-ltd)');
update organizations set slug = 'acme', brand_color = '#0055aa';
select test.ok((select slug = 'acme' and brand_color = '#0055aa' from organizations), 'Admin sets company link and colour');
reset role;
update subscriptions s set plan = a.plan, status = a.status, trial_ends_at = a.trial_ends_at, current_period_end = a.current_period_end
  from acme_sub a where s.org_id = a.org_id;
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.blocked($$update organizations set logo_url = 'https://cdn.example.com/acme.png'$$, 'permission denied', 'Admins cannot set the logo link directly (only the upload can)');
reset role;
update organizations set logo_url = 'https://abc123.supabase.co/storage/v1/object/public/logos/acme.png' where slug = 'acme';
select test.blocked($$update organizations set logo_url = 'https://cdn.example.com/acme.png' where slug = 'acme'$$, 'logo_url', 'The logo must be a file in our own logo storage');
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.blocked($$update organizations set slug = 'console'$$, 'reserved', 'Reserved link names (console, admin, …) are refused');
select test.blocked($$update organizations set brand_color = 'red'$$, 'brand_color', 'Brand colour must be a #hex value');
select test.as_user('00000000-0000-0000-0000-00000000000e', 'ceo@other.ng');
select test.blocked($$update organizations set slug = 'acme'$$, 'duplicate key', 'Two companies cannot share a link');
reset role;
set role anon;
select test.ok((select name = 'Acme Ltd' and logo_url like 'https://%' from org_branding('acme')), 'Public sign-in page can read only name/logo/colour for a link');
reset role;
set role authenticated;

\echo '--- Staff welcome screen'
select test.as_user('00000000-0000-0000-0000-00000000000b', 'tunde@acme.ng');
select mark_onboarded();
select test.ok((select onboarded_at is not null from members where email = 'tunde@acme.ng'), 'Finishing the welcome screen is remembered');

\echo '--- Console access'
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.blocked($$select console_overview()$$, 'Kora Forge staff', 'Company admins cannot open the console');
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com', 'aal1');
select test.blocked($$select console_overview()$$, 'two-factor', 'Console refuses staff who have not completed two-factor sign-in');
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select test.ok((console_overview() ->> 'companies')::int = 2, 'Console overview counts all companies');
select test.ok((select count(*) from console_companies('acme')) = 1, 'Console can search companies');
select test.ok((console_company(current_setting('test.acme')::uuid) -> 'counts' ->> 'active')::int >= 2, 'Company page shows counts only');
select test.blocked($$select * from console_staff_list(current_setting('test.acme')::uuid)$$, 'not granted support access', 'Staff list is hidden until the company grants support access');

\echo '--- Console actions (logged, need a reason)'
select test.blocked($$select console_extend_trial(current_setting('test.acme')::uuid, 14, '')$$, 'reason', 'Actions require a reason');
select test.ok(console_extend_trial(current_setting('test.acme')::uuid, 14, 'Client demo extension') > now() + interval '13 days', 'Owner extends a trial by 14 days');
select test.ok(console_grant_complimentary(current_setting('test.acme')::uuid, 'pro', 30, 1, 'Launch partner goodwill') > now(), 'Owner grants a complimentary month');
select test.ok((select count(*) from jsonb_array_elements(console_company(current_setting('test.acme')::uuid) -> 'payments') p where p ->> 'provider' = 'complimentary' and (p ->> 'amount_kobo')::int = 0) = 1,
               'Complimentary term is recorded as a ₦0 payment');
select test.ok(console_invite_member(current_setting('test.acme')::uuid, 'newhire@acme.ng', 'New Hire', 'Admin could not add user') is not null, 'Support can add a person for a company');
select test.blocked($$select console_invite_member(current_setting('test.acme')::uuid, 'x@gmail.com', 'X', 'Testing wrong domain')$$, 'is not a @acme.ng', 'Console still enforces the company email domain');
select test.ok((select count(*) from console_audit(50) where action in ('trial.extend','billing.complimentary','member.invite')) = 3, 'Every console action is in the audit log');

select test.as_console('00000000-0000-0000-0000-0000000000c2', 'helpdesk@koraforge.com');
select test.ok((console_overview() ->> 'companies')::int = 2, 'Viewer role can read the console');
select test.blocked($$select console_extend_trial(current_setting('test.acme')::uuid, 7, 'Viewer trying to act')$$, 'cannot do this', 'Viewer role cannot take actions');

\echo '--- Support access (client-controlled)'
select test.as_user('00000000-0000-0000-0000-00000000000b', 'tunde@acme.ng');
select test.blocked($$select grant_support_access(24)$$, 'Only company admins', 'Staff cannot grant support access');
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.blocked($$select grant_support_access(5)$$, '24 or 72', 'Support access is 24 or 72 hours only');
select test.ok(grant_support_access(24) between now() + interval '23 hours' and now() + interval '25 hours', 'Company admin grants 24h support access');
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select test.ok((select count(*) from console_staff_list(current_setting('test.acme')::uuid)) >= 3, 'With access granted, support can see the staff list');
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.ok((select count(*) from my_support_log() where action = 'support.view_staff') = 1, 'Company admin sees that support viewed their staff list');
select revoke_support_access();
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select test.blocked($$select * from console_staff_list(current_setting('test.acme')::uuid)$$, 'not granted', 'Revoking support access hides the staff list again');
select test.as_user('00000000-0000-0000-0000-00000000000e', 'ceo@other.ng');
select test.ok((select count(*) from my_support_log()) = 0, 'Another company cannot see Acme''s support log');

\echo '--- Suspension and ownership'
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select console_set_suspended(current_setting('test.acme')::uuid, true, 'Chargeback investigation');
select test.as_user('00000000-0000-0000-0000-00000000000c', 'kemi@acme.ng');
select test.blocked($$select check_in('in', 6.6018, 3.3515, 10)$$, 'suspended', 'Suspended company cannot check in');
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select console_set_suspended(current_setting('test.acme')::uuid, false, 'Investigation closed');
select console_transfer_ownership(current_setting('test.acme')::uuid, 'tunde@acme.ng', 'Original owner left the company');
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.ok((select role from members where email = 'tunde@acme.ng') = 'owner' and (select role from members where email = 'boss@acme.ng') = 'admin',
               'Console transfers ownership; old owner becomes admin');
select test.as_user('00000000-0000-0000-0000-00000000000b', 'tunde@acme.ng');
select test.blocked($$update members set role = 'owner' where email = 'kemi@acme.ng'$$, 'Ownership cannot be assigned', 'Companies still cannot reassign ownership themselves');

\o
\echo ''
\echo '✅ ALL DATABASE TESTS PASSED'
