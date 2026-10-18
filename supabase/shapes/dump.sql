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
