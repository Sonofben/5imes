-- 5ime: post-login routing + recovery-code hardening regression suite.
-- Runs after 40_console_branding_support.sql; reuses its orgs and users and
-- adds its own fixtures. Stops at the first FAIL.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;

-- ───────────────────────────────────────────── additional fixtures
-- Platform-staff + company-member combination: the user owns a company AND is
-- Kora Forge finance. post_auth_destination() must send them to /console.
insert into auth.users values ('00000000-0000-0000-0000-00000000d001');
insert into public.platform_staff (user_id, email, role)
  values ('00000000-0000-0000-0000-00000000d001', 'crossover@koraforge.com', 'finance');

-- Give them a company owner row in Acme.
insert into public.members (org_id, user_id, email, full_name, role, status)
  select id, '00000000-0000-0000-0000-00000000d001', 'crossover@koraforge.com', 'Crossover User', 'owner', 'active'
    from public.organizations where domain = 'acme.ng';

-- A plain active admin (no platform_staff). Reuse Acme's boss, already active owner.

-- Fixtures for recovery-code tests. One user per org so cross-org isolation
-- is testable.
insert into auth.users values
  ('00000000-0000-0000-0000-00000000d002'),
  ('00000000-0000-0000-0000-00000000d003');
insert into public.members (org_id, user_id, email, full_name, role, status)
  select id, '00000000-0000-0000-0000-00000000d002', 'rec-a@acme.ng', 'Recovery A', 'admin', 'active'
    from public.organizations where domain = 'acme.ng';
insert into public.members (org_id, user_id, email, full_name, role, status)
  select id, '00000000-0000-0000-0000-00000000d003', 'rec-b@other.ng', 'Recovery B', 'admin', 'active'
    from public.organizations where domain = 'other.ng';

-- Helper: switch to a given user with an aal + session_id in the fake JWT.
create or replace function test.as_user_sess(uid text, email text, aal text default 'aal1', session_id text default null)
returns void language plpgsql as $$
begin
  perform set_config('test.uid', uid, false);
  perform set_config('test.jwt', json_build_object(
    'email', email,
    'aal', aal,
    'session_id', coalesce(session_id, '00000000-0000-0000-0000-00000000e501'),
    'user_metadata', json_build_object('full_name', split_part(email, '@', 1))
  )::text, false);
end $$;
grant execute on function test.as_user_sess(text, text, text, text) to anon, authenticated;

set role authenticated;

\echo '--- post_auth_destination maps every role to the right path'

-- Signed-out → /login.
reset role;
select set_config('test.uid', '', false);
select set_config('test.jwt', '{}'::text, false);
set role authenticated;
select test.ok((select destination from public.post_auth_destination()) = '/login',
  'Signed-out destination is /login');

-- Platform staff with a company admin role → /console (precedence).
select test.as_user_sess('00000000-0000-0000-0000-00000000d001', 'crossover@koraforge.com', 'aal2');
select test.ok((select destination from public.post_auth_destination()) = '/console',
  'Platform staff with company membership still routes to /console');

-- Platform staff with no company membership → /console. (Reuses the console
-- fixture from 40_console_branding_support.sql.)
select test.as_user_sess('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com', 'aal2');
select test.ok((select destination from public.post_auth_destination()) = '/console',
  'Platform staff without company still routes to /console');

-- Active company admin, no platform_staff → /admin.
select test.as_user_sess('00000000-0000-0000-0000-00000000d002', 'rec-a@acme.ng', 'aal2');
select test.ok((select destination from public.post_auth_destination()) = '/admin',
  'Active company admin routes to /admin');

-- Active ordinary member → /app. Make one quickly.
reset role;
insert into auth.users values ('00000000-0000-0000-0000-00000000d010');
insert into public.members (org_id, user_id, email, role, status)
  select id, '00000000-0000-0000-0000-00000000d010', 'staffmember@acme.ng', 'staff', 'active'
    from public.organizations where domain = 'acme.ng';
set role authenticated;
select test.as_user_sess('00000000-0000-0000-0000-00000000d010', 'staffmember@acme.ng');
select test.ok((select destination from public.post_auth_destination()) = '/app',
  'Active staff member routes to /app');

-- Pending member → /pending.
reset role;
insert into auth.users values ('00000000-0000-0000-0000-00000000d011');
insert into public.members (org_id, user_id, email, role, status)
  select id, '00000000-0000-0000-0000-00000000d011', 'pendingstaff@acme.ng', 'staff', 'pending'
    from public.organizations where domain = 'acme.ng';
set role authenticated;
select test.as_user_sess('00000000-0000-0000-0000-00000000d011', 'pendingstaff@acme.ng');
select test.ok((select destination from public.post_auth_destination()) = '/pending',
  'Pending member routes to /pending');

-- Disabled member → /pending?disabled=1.
reset role;
insert into auth.users values ('00000000-0000-0000-0000-00000000d012');
insert into public.members (org_id, user_id, email, role, status)
  select id, '00000000-0000-0000-0000-00000000d012', 'disabledstaff@acme.ng', 'staff', 'disabled'
    from public.organizations where domain = 'acme.ng';
set role authenticated;
select test.as_user_sess('00000000-0000-0000-0000-00000000d012', 'disabledstaff@acme.ng');
select test.ok((select destination from public.post_auth_destination()) = '/pending?disabled=1',
  'Disabled member routes to /pending?disabled=1');

-- No-org company domain → /onboarding.
reset role;
insert into auth.users values ('00000000-0000-0000-0000-00000000d013');
set role authenticated;
select test.as_user_sess('00000000-0000-0000-0000-00000000d013', 'founder@brandnew.ng');
select test.ok((select destination from public.post_auth_destination()) = '/onboarding',
  'User on an un-registered company domain routes to /onboarding');

-- Public email domain → /start with reason.
reset role;
insert into auth.users values ('00000000-0000-0000-0000-00000000d014');
set role authenticated;
select test.as_user_sess('00000000-0000-0000-0000-00000000d014', 'personal@gmail.com');
select test.ok(
  (select destination from public.post_auth_destination()) = '/start' and
  (select reason from public.post_auth_destination()) = 'public_email',
  'Public-email user is told to use a company email'
);

\echo '--- log_security_event only accepts safe kinds from clients'

select test.as_user_sess('00000000-0000-0000-0000-00000000d002', 'rec-a@acme.ng');
select test.blocked(
  $$ select public.log_security_event('recovery_used', '{}'::jsonb) $$,
  'cannot write',
  'log_security_event rejects authenticated client writing recovery_used'
);
select test.blocked(
  $$ select public.log_security_event('recovery_regenerated', '{}'::jsonb) $$,
  'cannot write',
  'log_security_event rejects authenticated client writing recovery_regenerated'
);
-- Safe kinds still work.
select public.log_security_event('password_changed', '{}'::jsonb);
select test.ok(
  exists (select 1 from public.member_security_events
          where user_id = '00000000-0000-0000-0000-00000000d002'
            and kind = 'password_changed'),
  'log_security_event accepts password_changed from the owner'
);

\echo '--- replace_recovery_codes enforces aal2 inside the DB'

-- aal1 session should be refused even when it's the correct user.
select test.as_user_sess('00000000-0000-0000-0000-00000000d002', 'rec-a@acme.ng', 'aal1');
select test.blocked(
  $$ select public.replace_recovery_codes(array['ABCDEFGH12','ZZZZZZZZ22','QQQQQQQQ33','WWWWWWWW44','EEEEEEEE55','RRRRRRRR66','TTTTTTTT77','YYYYYYYY88','UUUUUUUU99','IIIIIIII00']) $$,
  'aal2',
  'replace_recovery_codes refuses an aal1 caller'
);

-- aal2 same user succeeds.
select test.as_user_sess('00000000-0000-0000-0000-00000000d002', 'rec-a@acme.ng', 'aal2');
select test.ok(
  public.replace_recovery_codes(array['ABCDEFGH12','ZZZZZZZZ22','QQQQQQQQ33','WWWWWWWW44','EEEEEEEE55','RRRRRRRR66','TTTTTTTT77','YYYYYYYY88','UUUUUUUU99','IIIIIIII00']) = 10,
  'replace_recovery_codes with aal2 writes all 10 hashes'
);

\echo '--- verify_and_consume_recovery_code: valid, invalid, replay, cross-user'

-- Valid: a brand-new session for the same user consumes code #1 once.
select test.as_user_sess('00000000-0000-0000-0000-00000000d002', 'rec-a@acme.ng', 'aal1', '00000000-0000-0000-0000-00000000ab02');
select test.ok(public.verify_and_consume_recovery_code('ABCDE-FGH12') = true,
  'Valid recovery code is accepted once');

-- Replay: the same code immediately after must fail.
select test.ok(public.verify_and_consume_recovery_code('ABCDE-FGH12') = false,
  'Replaying a consumed code is rejected');

-- The recovery_used audit row carries this session_id.
select test.ok(
  exists (
    select 1 from public.member_security_events
     where user_id = '00000000-0000-0000-0000-00000000d002'
       and kind = 'recovery_used'
       and session_id = '00000000-0000-0000-0000-00000000ab02'
  ),
  'recovery_used event is tagged with the session_id from the JWT'
);

-- Invalid: a garbage code never writes an event.
select test.ok(public.verify_and_consume_recovery_code('WRONG-CODE1') = false,
  'An unknown recovery code is rejected');

-- Cross-user: user B tries to consume one of user A's remaining codes.
select test.as_user_sess('00000000-0000-0000-0000-00000000d003', 'rec-b@other.ng', 'aal1');
select test.ok(public.verify_and_consume_recovery_code('ZZZZZ-ZZZ22') = false,
  'A different user cannot consume another user auth_recovery_code');
-- Confirm A still has that code unused.
reset role;
select test.ok(
  (select count(*) from public.auth_recovery_codes
    where user_id = '00000000-0000-0000-0000-00000000d002' and used_at is null) = 9,
  'User A still has 9 unused codes after both the valid consume and the cross-user attempt'
);
set role authenticated;

\echo '--- list_my_recovery_hashes and consume_recovery_code are gone'
reset role;
select test.ok(
  not exists (select 1 from pg_proc where proname = 'list_my_recovery_hashes' and pronamespace = 'public'::regnamespace),
  'list_my_recovery_hashes was dropped (no raw hashes leave the DB)'
);
select test.ok(
  not exists (select 1 from pg_proc where proname = 'consume_recovery_code' and pronamespace = 'public'::regnamespace),
  'consume_recovery_code was dropped'
);
set role authenticated;

\echo '--- cross-org isolation on member_security_events'

-- User A (admin of acme.ng) cannot see User B's (other.ng) security events.
reset role;
insert into public.member_security_events (org_id, user_id, kind, detail)
  select o.id, '00000000-0000-0000-0000-00000000d003', 'password_changed', '{}'::jsonb
    from public.organizations o where o.domain = 'other.ng';
set role authenticated;
select test.as_user_sess('00000000-0000-0000-0000-00000000d002', 'rec-a@acme.ng', 'aal2');
select test.ok(
  (select count(*) from public.member_security_events
     where user_id = '00000000-0000-0000-0000-00000000d003') = 0,
  'Cross-org read of member_security_events returns no rows'
);
-- Same admin can see events for their own org.
select test.ok(
  (select count(*) from public.member_security_events
     where user_id = '00000000-0000-0000-0000-00000000d002'
       and kind in ('password_changed','recovery_regenerated','recovery_used')) >= 2,
  'In-org admin can still read their own security events'
);
