-- 5ime: field staff (migration 0024). Visit Ltd (Premium): boss (owner), ade (staff); Other Visit Ltd (Basic).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
select set_config('test.uid', '', false);
select set_config('test.ade', (select id::text from public.members where email = 'ade@visit.ng'), false);
select set_config('test.bisi', (select id::text from public.members where email = 'bisi@visit.ng'), false);

\echo '--- setting up'
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select public.admin_set_field(current_setting('test.ade')::uuid, true);
select test.ok(public.admin_save_sites('[{"name":"Shoprite Lekki","address":"Admiralty Way","lat":6.4400,"lng":3.4700,"radius_m":150},{"name":"Ikeja Mall","lat":6.6018,"lng":3.3515}]') = 2,
  'An admin adds client sites in one go');
select set_config('test.site', (select id::text from public.client_sites where name = 'Shoprite Lekki'), false);
select set_config('test.plan', public.plan_visit(current_setting('test.ade')::uuid, current_setting('test.site')::uuid,
  (now() at time zone 'Africa/Lagos')::date, 'Restock check')::text, false);
select test.blocked(format($$select public.plan_visit(%L, %L, current_date, null)$$, current_setting('test.bisi'), current_setting('test.site')), 'field staff first',
  'Only field staff get visits');

\echo '--- visiting'
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select test.blocked(format($$select public.start_visit(%L, 6.60, 3.35, 20)$$, current_setting('test.site')), 'Check in when you get there', 'You must be at the site to check in');
select test.blocked(format($$select public.start_visit(%L, 6.44, 3.47, 500)$$, current_setting('test.site')), 'too rough', 'Rough GPS is refused');
select test.ok(public.start_visit(current_setting('test.site')::uuid, 6.4401, 3.4701, 15) = current_setting('test.plan')::uuid, 'Checking in at a planned site starts that visit');
select test.blocked(format($$select public.start_visit(%L, 6.4401, 3.4701, 15)$$, current_setting('test.site')), 'Finish your current visit', 'One open visit at a time');
select public.end_visit(current_setting('test.plan')::uuid, 6.4401, 3.4701, 15, 'Shelves restocked', 'completed', null);
select test.ok((select status = 'done' and 'very_short' = any(flags) and start_distance_m < 50 from public.site_visits where id = current_setting('test.plan')::uuid),
  'The visit is done, timed and flagged if very short');
reset role;
select set_config('test.uid', '', false);
select test.ok(not exists (select 1 from information_schema.columns where table_name = 'site_visits' and column_name in ('lat','lng')), 'No coordinates are stored for visits');

\echo '--- managers and other people'
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f903', 'bisi@visit.ng');
select test.ok((select count(*) from public.site_visits) = 0, 'Colleagues don''t see each other''s visits');
select test.blocked(format($$select public.plan_visit(%L, %L, current_date, null)$$, current_setting('test.ade'), current_setting('test.site')), 'own team', 'Staff cannot plan visits for others');
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select test.ok((select (r ->> 'done')::int = 1 from jsonb_array_elements(public.field_report(current_date - 7, current_date + 1)) r where r ->> 'member_id' = current_setting('test.ade')),
  'The field report counts the visit');
select test.as_console('00000000-0000-0000-0000-00000000f911', 'boss@other-visit.ng');
select test.blocked($$select public.admin_save_sites('[{"name":"Shop","lat":6.4,"lng":3.4}]')$$, 'Premium', 'Basic has no field staff');
select test.ok((select count(*) from public.client_sites) = 0, 'Another company sees none of these sites');
reset role;
select set_config('test.uid', '', false);
delete from public.site_visits; delete from public.client_sites;
update public.members set is_field = false where id = current_setting('test.ade')::uuid;

\o
\echo '✅ FIELD STAFF TESTS PASSED'
