-- 5ime: brand kit (migration 0017). Reuses Visit Ltd (Premium) and Other Visit Ltd from 96–97.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
update public.subscriptions set plan = 'basic', status = 'active', trial_ends_at = null,
       current_period_start = now() - interval '1 day', current_period_end = now() + interval '30 days', seats_paid = 5
 where org_id = (select id from public.organizations where domain = 'other-visit.ng');
select set_config('test.uid', '', false);  -- as the database owner, not a signed-in user
update public.organizations set brand_color = '#112233' where domain = 'other-visit.ng';  -- saved while on trial

\echo '--- colours need Pro or Premium; the logo works on every plan'
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f911', 'boss@other-visit.ng');
select test.blocked($$update public.organizations set brand_color = '#aa0000'$$, 'Pro and Premium', 'A Basic company cannot set a main colour');
select test.blocked($$update public.organizations set accent_color = '#aa0000'$$, 'Pro and Premium', 'or an accent colour');
update public.organizations set brand_color = null;
select test.ok((select brand_color is null from public.organizations), 'but can clear a colour');
reset role;
select set_config('test.uid', '', false);
update public.organizations set brand_color = '#112233' where domain = 'other-visit.ng';
set role anon;
select test.ok((select brand_color is null and accent_color is null from public.org_branding('other-visit-ltd')),
  'A Basic company’s saved colour is not shown on its sign-in page');
reset role;

set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
update public.organizations set brand_color = '#0E4D3C', accent_color = '#F2B134';
select test.ok((select accent_color = '#F2B134' from public.organizations), 'A Premium admin sets main and accent colours');
select test.blocked($$update public.organizations set accent_color = 'gold'$$, 'accent_color', 'Colours must be #hex values');
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select test.ok((public.my_org_brand() ->> 'accent') = '#F2B134', 'Staff see their company brand in the app');
update public.organizations set accent_color = '#000000';  -- staff: row-level security means nothing is updated
reset role;
select test.ok((select accent_color = '#F2B134' from public.organizations where domain = 'visit.ng'), 'The staff update changed nothing');
select set_config('test.vslug', (select slug from public.organizations where domain = 'visit.ng'), false);
set role anon;
select test.ok((select brand_color = '#0E4D3C' and accent_color = '#F2B134' from public.org_branding(current_setting('test.vslug'))),
  'The company sign-in page shows both colours');
select test.blocked($$select public.org_brand(gen_random_uuid())$$, 'permission denied', 'Signed-out callers cannot read any company’s brand directly');
reset role;
set role service_role;
select test.ok((public.visit_pass('nothing') is null), 'Visitor pages still refuse made-up links');
select test.ok((public.walkin_context((select token from public.visitor_links where revoked_at is null limit 1)) -> 'brand' ->> 'primary') = '#0E4D3C',
  'The walk-in form carries the company colours');
reset role;

\o
\echo '✅ BRAND KIT TESTS PASSED'
