-- 5ime: the visitor clean-up preview (0035) and the clean-up itself (vms_purge_expired) only touch
-- records past each company's OWN retention settings, and the preview changes nothing.
-- Two companies: Two Step Ltd (98_zzzz1, no visitor settings → defaults 90 days / photos 30 days)
-- and Short Keep Ltd (details kept 30 days, photos 7 days).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
insert into auth.users values ('00000000-0000-0000-0000-0000000a3001');
set role authenticated;
select test.as_user_sess('00000000-0000-0000-0000-0000000a3001', 'boss@shortkeep.ng', 'aal2');
select public.create_organization('Short Keep Ltd');
reset role;
select set_config('test.ts', (select id::text from public.organizations where domain = 'twostep.ng'), false);
select set_config('test.sk', (select id::text from public.organizations where domain = 'shortkeep.ng'), false);
delete from public.visitor_settings where org_id = current_setting('test.ts')::uuid;
insert into public.visitor_settings (org_id, retention_days, photo_retention_days) values (current_setting('test.sk')::uuid, 30, 7);

insert into public.visits (org_id, visitor_name, code, status, signed_in_at, signed_out_at, photo_path) values
  -- Two Step (90 days): 60 days old is kept, 100 days old is due; on site for 20 hours is signed out.
  (current_setting('test.ts')::uuid, 'Kept Sixty',     'CLNTS060', 'left',    now() - interval '60 days',  now() - interval '60 days',  null),
  (current_setting('test.ts')::uuid, 'Old Hundred',    'CLNTS100', 'left',    now() - interval '100 days', now() - interval '100 days', null),
  (current_setting('test.ts')::uuid, 'Still Here',     'CLNTSONS', 'on_site', now() - interval '20 hours', null,                        null),
  -- Short Keep (30 days, photos 7 days): 60 days old is due (with its photo); 10 days old keeps its details but loses its photo.
  (current_setting('test.sk')::uuid, 'Short Sixty',    'CLNSK060', 'left',    now() - interval '60 days',  now() - interval '60 days',  current_setting('test.sk') || '/sixty.jpg'),
  (current_setting('test.sk')::uuid, 'Short Ten',      'CLNSK010', 'left',    now() - interval '10 days',  now() - interval '10 days',  current_setting('test.sk') || '/ten.jpg'),
  (current_setting('test.sk')::uuid, 'Short Two',      'CLNSK002', 'left',    now() - interval '2 days',   now() - interval '2 days',   current_setting('test.sk') || '/two.jpg');

\echo '--- the preview is for the server only'
set role authenticated;
select test.blocked($q$select * from public.vms_purge_preview()$q$, 'permission denied', 'Signed-in users cannot run the clean-up preview');

\echo '--- the preview counts what is due under each company''s own settings, and changes nothing'
set role service_role;
select set_config('test.prev', (select jsonb_agg(to_jsonb(p))::text from public.vms_purge_preview() p
                                  where p.org_id in (current_setting('test.ts')::uuid, current_setting('test.sk')::uuid)), false);
reset role;
select test.ok((select (e ->> 'details_due')::int = 1 and (e ->> 'photos_due')::int = 0 and (e ->> 'sign_out_due')::int = 1
                  from jsonb_array_elements(current_setting('test.prev')::jsonb) e where e ->> 'org_id' = current_setting('test.ts')),
  'Two Step (default 90 days): 1 record due, 1 visitor to sign out, the 60-day-old record is not due');
select test.ok((select (e ->> 'details_due')::int = 1 and (e ->> 'photos_due')::int = 2 and (e ->> 'sign_out_due')::int = 0
                  from jsonb_array_elements(current_setting('test.prev')::jsonb) e where e ->> 'org_id' = current_setting('test.sk')),
  'Short Keep (30 days, photos 7 days): 1 record and 2 photos due');
select test.ok((select count(*) from public.visits where code like 'CLN%' and visitor_name <> 'Deleted visitor') = 6
            and (select count(*) from public.visits where code like 'CLN%' and photo_path is not null) = 3
            and (select status from public.visits where code = 'CLNTSONS') = 'on_site',
  'The preview changed nothing');
select test.ok(position('Sixty' in current_setting('test.prev')) = 0 and position('sixty.jpg' in current_setting('test.prev')) = 0,
  'The preview has counts only: no names or photo paths');

\echo '--- the clean-up deletes only what the preview said was due'
set role service_role;
select count(*) from public.vms_purge_expired(1000);
reset role;
select test.ok((select visitor_name from public.visits where code = 'CLNTS060') = 'Kept Sixty', 'Two Step: 60-day-old record kept (inside 90 days)');
select test.ok((select visitor_name from public.visits where code = 'CLNTS100') = 'Deleted visitor', 'Two Step: 100-day-old record deleted');
select test.ok((select status = 'left' and auto_signed_out from public.visits where code = 'CLNTSONS'), 'Two Step: visitor on site for 20 hours signed out');
select test.ok((select visitor_name = 'Deleted visitor' and photo_path is null from public.visits where code = 'CLNSK060'), 'Short Keep: 60-day-old record and photo deleted');
select test.ok((select visitor_name = 'Short Ten' and photo_path is null from public.visits where code = 'CLNSK010'), 'Short Keep: 10-day-old record kept, its photo deleted');
select test.ok((select visitor_name = 'Short Two' and photo_path is not null from public.visits where code = 'CLNSK002'), 'Short Keep: 2-day-old record and photo kept');
set role service_role;
select test.ok(not exists (select 1 from public.vms_purge_preview() p
                            where p.org_id in (current_setting('test.ts')::uuid, current_setting('test.sk')::uuid)),
  'Afterwards nothing is due for either company');
reset role;
select test.ok(exists (select 1 from public.visitor_audit where org_id = current_setting('test.sk')::uuid and action = 'retention_purge'),
  'The clean-up is recorded in the company''s visitor audit trail');

\o
\echo '✅ VISITOR CLEAN-UP TESTS PASSED'
