-- 5ime: Global Admin — pricing, settings, announcements, lifecycle, people, security, team.
-- Reuses console users from 40_console_branding_support.sql (c1 owner, c2 viewer).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
update auth.users set email = 'joseph@koraforge.com', last_sign_in_at = now() where id = '00000000-0000-0000-0000-0000000000c1';
update auth.users set email = 'helpdesk@koraforge.com' where id = '00000000-0000-0000-0000-0000000000c2';
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c3', 'ops@koraforge.com');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000b801', 'ceo@newco.ng');
set role authenticated;

\echo '--- prices and trial come from Global Admin settings'
select test.as_console('00000000-0000-0000-0000-0000000000c2', 'helpdesk@koraforge.com');
select test.blocked($$select public.console_set_plan_terms('basic','Basic',300,'x',array['a'],1,'Price review')$$, 'cannot do this', 'Read-only admin cannot change prices');
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com', 'aal1');
select test.blocked($$select public.console_set_plan_terms('basic','Basic',300,'x',array['a'],1,'Price review')$$, 'two-factor', 'Global admin needs two-factor');
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select test.blocked($$select public.console_set_plan_terms('basic','Basic',300,'x',array['a'],1,'')$$, 'reason', 'Price change needs a reason');
select public.console_set_plan_terms('basic', 'Basic', 300, 'One office', array['One office', ' '], 1, 'Price review 2027');
select public.console_set_platform(21, false, null, 'Longer trial for Q4');
select test.ok((public.public_plans() -> 'plans' -> 0 ->> 'pricePerSeat')::int = 300, 'New Basic price is public');
select test.ok((public.public_plans() ->> 'trial_days')::int = 21, 'New trial length is public');
reset role;
select test.ok((select count(*) from public.platform_audit where action in ('pricing.update','platform.settings')) = 2, 'Both changes are logged');
select test.ok(public.plan_price('basic') = 300 and public.plan_price('pro') = 600, 'plan_price reads the table');
select test.ok(position('public.plan_price(p_plan)' in pg_get_functiondef('public.prepare_paystack_subscription(text,text,integer,integer,boolean)'::regprocedure)) > 0,
  'Checkout pricing now uses the settings table');
select test.ok(position('platform_trial_days' in pg_get_functiondef('public.create_organization(text)'::regprocedure)) > 0,
  'New companies get the configured trial length');
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000b802');
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000b802', 'boss@trialco.ng');
select public.create_organization('TrialCo');
select test.ok((select trial_ends_at between now() + interval '20 days 23 hours' and now() + interval '21 days 1 hour' from public.subscriptions),
  'Self sign-up now gets the 21-day trial');

\echo '--- announcements and maintenance'
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select public.console_announce('New reports page is live', 'info', null, 'everyone', 24, 'Release note');
select public.console_set_platform(21, true, 'Upgrading servers until 10pm', 'Planned maintenance');
select test.as_user('00000000-0000-0000-0000-00000000000b', 'tunde@acme.ng');
select test.ok((select count(*) from public.my_announcements()) = 2, 'Staff see the announcement and the maintenance notice');
select test.blocked($$select public.check_in('out', 6.6018, 3.3515, 10)$$, 'Upgrading servers', 'Maintenance pauses check-ins');
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select public.console_set_platform(21, false, null, 'Maintenance finished');
select public.console_end_announcement((select id from public.console_announcements() limit 1));
select test.as_user('00000000-0000-0000-0000-00000000000b', 'tunde@acme.ng');
select test.ok((select count(*) from public.my_announcements()) = 0, 'Ended announcement and maintenance disappear');

\echo '--- revenue, payments, health'
select test.as_console('00000000-0000-0000-0000-0000000000c2', 'helpdesk@koraforge.com');
select test.ok(public.console_revenue() ? 'monthly_run_rate_kobo', 'Read-only admin sees revenue');
select test.ok((select count(*) from public.console_payments()) >= 0, 'Payments list works');
select test.ok(jsonb_array_length(public.console_health() -> 'checkins_by_day') = 14, 'Health shows 14 days of check-ins');
select test.ok(jsonb_array_length(public.console_health() -> 'signups_by_week') = 12, 'Health shows 12 weeks of sign-ups');

\echo '--- company lifecycle'
select test.as_console('00000000-0000-0000-0000-0000000000c2', 'helpdesk@koraforge.com');
select test.blocked($$select public.console_create_company('NewCo','newco.ng','ceo@newco.ng','CEO',14,'Signed contract')$$, 'cannot do this', 'Read-only admin cannot create companies');
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select test.blocked($$select public.console_create_company('Xco','gmail.com','a@gmail.com','A',14,'Signed contract')$$, 'Public email', 'Public domains are refused');
select test.blocked($$select public.console_create_company('Xco','newco.ng','ceo@other.ng','A',14,'Signed contract')$$, 'must be on', 'Owner email must match the domain');
select set_config('test.newco', public.console_create_company('NewCo Ltd', 'newco.ng', 'ceo@newco.ng', 'Ngozi CEO', 30, 'Signed contract')::text, false);
reset role;
select test.ok((select role = 'owner' and status = 'invited' from public.members where email = 'ceo@newco.ng'), 'Owner is invited');
select test.ok((select count(*) from public.schedules where org_id = current_setting('test.newco')::uuid) = 7, 'Default work week created');
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000b801', 'ceo@newco.ng');
select test.ok(join_organization() ->> 'status' = 'active', 'Owner becomes active on first sign-in');
select test.ok((select destination from public.post_auth_destination()) = '/admin', 'Owner lands on /admin');

select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select public.console_set_plan(current_setting('test.newco')::uuid, 'basic', 25, 'Annual contract, 25 seats');
select test.ok((select (public.console_company(current_setting('test.newco')::uuid) -> 'subscription' ->> 'seats_paid')::int) = 25, 'Plan and seats changed');
select test.blocked($$select public.console_company_snapshot(current_setting('test.newco')::uuid)$$, 'not granted support access', 'View-as needs the company''s permission');
select test.ok(public.console_company_export(current_setting('test.newco')::uuid, 'Customer asked for export') ->> 'staff' like 'Not included%',
  'Export leaves staff out without permission');
select test.blocked($$select public.console_delete_company(current_setting('test.newco')::uuid, 'newco.ng', 'Closing account')$$, 'Archive the company first', 'Must archive before delete');
select public.console_set_archived(current_setting('test.newco')::uuid, true, 'Customer left');
select test.ok((select count(*) from public.console_companies(null, false) where domain = 'newco.ng') = 0, 'Archived companies leave the main list');
select test.ok((select count(*) from public.console_companies(null, true) where domain = 'newco.ng') = 1, 'They show under Archived');
select test.blocked($$select public.console_delete_company(current_setting('test.newco')::uuid, 'wrong.ng', 'Closing account')$$, 'Type the company domain', 'Delete needs the domain typed');
select public.console_delete_company(current_setting('test.newco')::uuid, 'newco.ng', 'Closing account');
reset role;
select test.ok(not exists (select 1 from public.organizations where domain = 'newco.ng'), 'Company deleted');
select test.ok(exists (select 1 from public.platform_audit where action = 'company.delete' and details ->> 'domain' = 'newco.ng'), 'Deletion stays in the audit log');
set role authenticated;

\echo '--- view-as with permission'
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select public.grant_support_access(24);
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select test.ok(jsonb_array_length(public.console_company_snapshot(current_setting('test.acme')::uuid) -> 'people') > 0, 'With permission, view-as shows the people');
select test.ok(jsonb_typeof(public.console_company_export(current_setting('test.acme')::uuid, 'Customer asked for export') -> 'staff') = 'array', 'Export includes staff with permission');
select test.as_console('00000000-0000-0000-0000-0000000000c2', 'helpdesk@koraforge.com');
select test.blocked($$select public.console_company_snapshot(current_setting('test.acme')::uuid)$$, 'cannot do this', 'Read-only admin cannot view-as');

\echo '--- people and security'
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select test.blocked($$select * from public.console_find_person('tunde')$$, 'full email', 'Search needs a full email (no browsing)');
reset role;
update auth.users set email = 'tunde@acme.ng' where id = '00000000-0000-0000-0000-00000000000b';
insert into auth.sessions (user_id) values ('00000000-0000-0000-0000-00000000000b');
insert into auth.mfa_factors (user_id, status, factor_type) values ('00000000-0000-0000-0000-00000000000b', 'verified', 'totp');
set role authenticated;
select test.ok((select company = 'Acme Ltd' and totp_enrolled from public.console_find_person('Tunde@Acme.ng')), 'Exact email finds the person, company and 2FA');
select public.console_force_signout('00000000-0000-0000-0000-00000000000b', 'Lost laptop');
reset role;
select test.ok(not exists (select 1 from auth.sessions where user_id = '00000000-0000-0000-0000-00000000000b'), 'Force sign-out ends their sessions');
set role authenticated;
select public.console_set_locked('00000000-0000-0000-0000-00000000000b', true, 'Suspicious sign-ins');
select test.ok((select locked from public.console_find_person('tunde@acme.ng')), 'Account locked');
select test.ok(jsonb_array_length(public.console_security() -> 'locked') = 1, 'Security center lists locked accounts');
select public.console_set_locked('00000000-0000-0000-0000-00000000000b', false, 'Cleared with customer');
select public.console_reset_mfa('00000000-0000-0000-0000-00000000000b', 'Phone lost, identity checked');
select test.ok(not (select totp_enrolled from public.console_find_person('tunde@acme.ng')), '2FA reset');
select test.blocked($$select public.console_set_locked('00000000-0000-0000-0000-0000000000c1', true, 'testing self')$$, 'own account', 'Cannot lock yourself');

\echo '--- Global Admin team'
select test.blocked($$select public.console_team_add('nobody@koraforge.com', 'support', 'New hire')$$, 'No 5ime login', 'Team member needs a 5ime login');
select public.console_team_add('OPS@koraforge.com', 'support', 'New support hire');
select test.ok((select count(*) from public.console_team() where email = 'ops@koraforge.com' and role = 'support') = 1, 'New team member listed with their role');
select test.blocked($$select public.console_team_set_role('00000000-0000-0000-0000-0000000000c1', 'viewer', 'Step down')$$, 'at least one Global admin', 'Last Global admin cannot be demoted');
select test.blocked($$select public.console_team_remove('00000000-0000-0000-0000-0000000000c1', 'Leaving')$$, 'at least one Global admin', 'Last Global admin cannot be removed');
select public.console_team_set_role('00000000-0000-0000-0000-0000000000c3', 'finance', 'Moved to billing');
select public.console_team_remove('00000000-0000-0000-0000-0000000000c3', 'Contract ended');
select test.as_console('00000000-0000-0000-0000-0000000000c2', 'helpdesk@koraforge.com');
select test.blocked($$select public.console_team_add('ops@koraforge.com', 'owner', 'Promote myself')$$, 'cannot do this', 'Only Global admins manage the team');

\echo '--- normal users cannot reach any of it'
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.blocked($$select public.console_revenue()$$, 'Kora Forge staff', 'Company admins cannot open Global Admin');
select test.blocked($$select * from public.platform_plans$$, 'permission denied', 'Price table is not directly readable');

reset role;
\o
\echo '✅ GLOBAL ADMIN TESTS PASSED'
