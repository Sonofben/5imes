-- 5ime: company links cannot take the site's own page names.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.blocked($$update organizations set slug = 'signup'$$, 'reserved', 'Company link "signup" is refused');
select test.blocked($$update organizations set slug = 'global-admin'$$, 'reserved', 'Company link "global-admin" is refused');
select test.blocked($$update organizations set slug = 'sitemap'$$, 'reserved', 'Company link "sitemap" is refused');
reset role;
select test.ok(public.unique_org_slug('Signup') = 'signup-2', 'A company named "Signup" gets signup-2');
\o
\echo '✅ RESERVED LINK TESTS PASSED'
