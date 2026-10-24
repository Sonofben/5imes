-- Dumps the jsonb output of our database functions so test/json-shapes.test.mjs can check the
-- app's schemas against them. Run after all migrations and tests (CI does this).
\set QUIET 1
\pset tuples_only on
\pset footer off
\pset format unaligned
select id as org_id from public.organizations order by created_at limit 1 \gset
select coalesce((select g.org_id from public.support_access_grants g where g.revoked_at is null and g.expires_at > now() limit 1), :'org_id') as grant_org \gset
set role authenticated;
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
\o supabase/shapes/out/console_overview.json
select public.console_overview();
\o supabase/shapes/out/console_health.json
select public.console_health();
\o supabase/shapes/out/console_revenue.json
select public.console_revenue();
\o supabase/shapes/out/console_plans.json
select public.console_plans();
\o supabase/shapes/out/console_security.json
select public.console_security();
\o supabase/shapes/out/console_company.json
select public.console_company(:'org_id');
\o supabase/shapes/out/console_company_snapshot.json
select public.console_company_snapshot(:'grant_org');
\o supabase/shapes/out/public_plans.json
select public.public_plans();
\o
reset role;

-- Visitor management (0015/0016), as the Visit Ltd admin from supabase/tests/96–97.
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select id as vloc from public.locations where name = 'Ikoyi Office' \gset
select public.vms_invite(:'vloc', 'Shape Visitor', 'shape@example.com', '0801 000 0000', 'Shape Co', 'Shapes', now()) as inv \gset
select :'inv'::jsonb ->> 'pass_token' as pass_token, :'inv'::jsonb ->> 'code' as vcode, :'inv'::jsonb ->> 'id' as vid \gset
select public.vms_visitor_link(:'vloc') as vlink \gset
\o supabase/shapes/out/invitation.json
select :'inv';
\o supabase/shapes/out/vms_report.json
select public.vms_report(current_date - 30, current_date);
\o supabase/shapes/out/vms_desk_find.json
select public.vms_desk_find(:'vcode');
\o
reset role;
set role service_role;
\o supabase/shapes/out/visit_pass.json
select public.visit_pass(:'pass_token');
\o supabase/shapes/out/walkin_context.json
select public.walkin_context(:'vlink');
\o supabase/shapes/out/visit_checkin.json
select public.visit_checkin(:'pass_token', :'vcode', null, null, true);
\o
reset role;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
\o supabase/shapes/out/vms_admit.json
select public.vms_admit(:'vid');
\o supabase/shapes/out/my_org_brand.json
select public.my_org_brand();
\o
reset role;
