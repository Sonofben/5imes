-- 5ime: display currencies on the website (migration 0028).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
reset role;
select set_config('test.uid', '', false);
set role anon;
select test.ok(jsonb_array_length(public.public_currencies()) = 4, 'Visitors get naira, dollar, euro and pound rates');
select test.blocked($$select count(*) from public.platform_currencies$$, 'permission denied', 'but cannot read the table directly');
reset role;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select public.console_set_currency('USD', 1600, 20, true, 'Rate update with margin');
select test.ok((select (c ->> 'markupPct')::numeric = 20 from jsonb_array_elements(public.public_currencies()) c where c ->> 'code' = 'USD'), 'Global admin sets the rate and markup');
select test.blocked($$select public.console_set_currency('NGN', 2, 0, true, 'Change naira')$$, 'Naira prices', 'Naira is not converted');
select test.as_console('00000000-0000-0000-0000-0000000000c2', 'helpdesk@koraforge.com');
select test.blocked($$select public.console_set_currency('USD', 1, 0, true, 'Viewer change')$$, 'cannot do this', 'Read-only admins cannot change rates');
reset role;
select set_config('test.uid', '', false);
update public.platform_currencies set ngn_per_unit = 1500, markup_pct = 0 where code = 'USD';
\o
\echo '✅ CURRENCY TESTS PASSED'
