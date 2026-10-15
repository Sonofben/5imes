-- 5ime: brand-new owner sign-up path + security status readability.
-- Mirrors the live bug report: a fresh owner must route /start → /onboarding →
-- /admin, and every read the admin pages make as that owner must succeed.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
insert into auth.users values ('00000000-0000-0000-0000-00000000f001');
set role authenticated;

\echo '--- new owner: sign-up → onboarding → admin'
select test.as_user_sess('00000000-0000-0000-0000-00000000f001', 'joseph.benson@trostech.ng');
select test.ok(join_organization() ->> 'status' = 'no_org', 'Fresh company email has no workspace yet');
select test.ok((select destination from public.post_auth_destination()) = '/onboarding', 'Fresh user is routed to /onboarding');
select public.create_organization('Trostech');
select test.ok((select destination from public.post_auth_destination()) = '/admin', 'New owner is routed to /admin');
select test.ok(join_organization() ->> 'status' = 'active', 'Calling join again on /start is harmless');

-- The exact reads requireMember() makes. If either fails, the app used to bounce
-- between /admin and /start forever.
select test.ok((select count(*) from public.members
  where user_id = '00000000-0000-0000-0000-00000000f001' and role = 'owner' and status = 'active') = 1,
  'Owner can read their own member row');
select test.ok((select count(*) from public.organizations o
  join public.members m on m.org_id = o.id
  where m.user_id = '00000000-0000-0000-0000-00000000f001' and o.slug is not null) = 1,
  'Owner can read their company (with a company link)');
select test.ok((select count(*) from public.subscriptions s
  join public.members m on m.org_id = s.org_id
  where m.user_id = '00000000-0000-0000-0000-00000000f001' and s.status = 'trialing') = 1,
  'Owner sees the 14-day trial');

\echo '--- my_security_status works for the authenticated role'
select test.ok((select totp_enrolled from public.my_security_status) = false, 'No authenticator yet → not enrolled');
reset role;
insert into auth.mfa_factors (user_id, status, factor_type)
  values ('00000000-0000-0000-0000-00000000f001', 'verified', 'totp');
set role authenticated;
select test.ok((select totp_enrolled from public.my_security_status) = true, 'Verified authenticator → enrolled');
select test.ok((select count(*) from public.my_security_status) = 1, 'Only the caller''s own row is returned');

reset role;
select set_config('test.uid', '', false);
set role anon;
select test.blocked($$select * from public.my_security_status$$, 'permission denied', 'Signed-out visitors cannot read security status');
reset role;

\o
\echo '✅ SIGN-UP FLOW + SECURITY STATUS TESTS PASSED'
