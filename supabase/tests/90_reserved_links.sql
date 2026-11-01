-- 5ime: company links live under /c/, so page names are no longer blocked; 5ime's own names still are.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.blocked($$select public.request_company_link('5ime')$$, 'reserved', 'Company link "5ime" is refused');
select test.blocked($$select public.request_company_link('koraforge')$$, 'reserved', 'Company link "koraforge" is refused');
reset role;
select test.ok(public.unique_org_slug('Signup') = 'signup', 'A company named "Signup" can now have the link signup');
select test.ok(public.unique_org_slug('Support') = 'support-2', 'A company named "Support" gets support-2');
\o
\echo '✅ RESERVED LINK TESTS PASSED'
