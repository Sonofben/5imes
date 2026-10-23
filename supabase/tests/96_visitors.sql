-- 5ime: Premium plan and visitor management (migration 0015).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
grant usage on schema test to service_role;
grant execute on all functions in schema test to service_role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng'),
  ('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng'),
  ('00000000-0000-0000-0000-00000000f903', 'bisi@visit.ng'),
  ('00000000-0000-0000-0000-00000000f911', 'boss@other-visit.ng');

set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select public.create_organization('Visit Ltd');
insert into public.locations (org_id, name, lat, lng, radius_m, address)
  values (public.my_org_id(), 'Ikoyi Office', 6.45, 3.43, 150, '1 Bourdillon Rd, Ikoyi, Lagos');
select public.invite_member('ade@visit.ng', 'Ade', 'staff');
select public.invite_member('bisi@visit.ng', 'Bisi', 'staff');
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');  select public.join_organization();
select test.as_console('00000000-0000-0000-0000-00000000f903', 'bisi@visit.ng'); select public.join_organization();
select test.as_console('00000000-0000-0000-0000-00000000f911', 'boss@other-visit.ng');
select public.create_organization('Other Visit Ltd');
insert into public.locations (org_id, name, lat, lng, radius_m) values (public.my_org_id(), 'Other Office', 6.5, 3.4, 150);
reset role;
select set_config('test.vorg', (select id::text from public.organizations where domain = 'visit.ng'), false);
select set_config('test.vloc', (select id::text from public.locations where name = 'Ikoyi Office'), false);
select set_config('test.oloc', (select id::text from public.locations where name = 'Other Office'), false);
select set_config('test.ade',  (select id::text from public.members where email = 'ade@visit.ng'), false);
select set_config('test.bisi', (select id::text from public.members where email = 'bisi@visit.ng'), false);

\echo '--- Premium plan'
select test.ok((select count(*) from public.platform_plans where plan = 'premium' and price_naira = 1000) = 1, 'Premium plan exists at ₦1,000 per seat (editable in Global Admin)');
select test.ok(position('''premium''' in pg_get_functiondef('public.prepare_paystack_subscription(text,text,integer,integer,boolean)'::regprocedure)) > 0,
  'Checkout accepts the Premium plan');
select test.ok(position('''premium''' in pg_get_functiondef('public.replace_schedule(uuid,uuid,jsonb)'::regprocedure)) > 0,
  'Premium includes Pro features (per-person schedules)');
select test.ok(public.org_has_premium(current_setting('test.vorg')::uuid), 'A company on its free trial can use visitor management');
update public.subscriptions set plan = 'pro', status = 'active', trial_ends_at = null,
       current_period_start = now() - interval '1 day', current_period_end = now() + interval '30 days', seats_paid = 10
 where org_id = current_setting('test.vorg')::uuid;
select test.ok(not public.org_has_premium(current_setting('test.vorg')::uuid), 'A paid Pro company does not have visitor management');
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select test.blocked(format($$select public.vms_invite(%L, 'Tolu Ade', null, null, null, null, now() + interval '1 hour')$$, current_setting('test.vloc')),
  'Premium plan', 'Pro companies are told visitor management is a Premium feature');
reset role;
update public.subscriptions set plan = 'premium' where org_id = current_setting('test.vorg')::uuid;
select test.ok(public.org_has_premium(current_setting('test.vorg')::uuid), 'A paid Premium company has visitor management');

\echo '--- invitations'
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select set_config('test.inv', public.vms_invite(current_setting('test.vloc')::uuid, 'Tolu Ade', 'Tolu@Example.com', '0803 111 2222', 'Acme', 'Contract meeting', now() + interval '1 hour')::text, false);
select test.ok((current_setting('test.inv')::jsonb ->> 'code') ~ '^[A-Z2-9]{8}$', 'An invitation gets an 8-character tablet code');
select test.ok(length(current_setting('test.inv')::jsonb ->> 'pass_token') = 32, 'and a pass link token, returned once');
select test.blocked(format($$select public.vms_invite(%L, 'Someone', null, null, null, null, now(), %L)$$, current_setting('test.vloc'), current_setting('test.bisi')),
  'only invite visitors you are hosting', 'Staff cannot invite a visitor on someone else’s behalf');
select test.blocked(format($$select public.vms_invite(%L, 'Someone', null, null, null, null, now())$$, current_setting('test.oloc')),
  'Choose one of your offices', 'Staff cannot invite to another company’s office');
select test.blocked(format($$select public.vms_invite(%L, 'Someone', 'not-an-email', null, null, null, now())$$, current_setting('test.vloc')),
  'valid email', 'Visitor email is checked');
select test.ok((select count(*) from public.visits) = 1, 'Ade sees the visit he hosts');
reset role;
select test.ok((select visitor_email from public.visits where visitor_name = 'Tolu Ade') = 'tolu@example.com', 'Email is stored in lower case');
select test.ok((select pass_token_hash is not null and pass_token_hash <> current_setting('test.inv')::jsonb ->> 'pass_token' from public.visits where visitor_name = 'Tolu Ade'),
  'Only a hash of the pass token is stored');
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f903', 'bisi@visit.ng');
select test.ok((select count(*) from public.visits) = 0, 'Bisi cannot see Ade’s visitor');
select test.blocked($$select pass_token_hash from public.visits$$, 'permission denied', 'Nobody can read pass token hashes');
select test.blocked($$select photo_path from public.visits$$, 'permission denied', 'Photo paths are server-only');
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select test.ok((select count(*) from public.visits) = 1, 'The admin sees all the company’s visits');
select test.blocked($$insert into public.visits (org_id, visitor_name, code) values (public.my_org_id(), 'x', 'ZZZZZZZZ')$$, 'permission denied', 'Visits cannot be written directly');

\echo '--- visitor pass page'
reset role;
set role service_role;
select test.ok((public.visit_pass(current_setting('test.inv')::jsonb ->> 'pass_token') ->> 'name') = 'Tolu Ade', 'The pass link shows the visitor their pass');
select test.ok((public.visit_pass(current_setting('test.inv')::jsonb ->> 'pass_token') -> 'location' ->> 'address') like '1 Bourdillon%', 'with the office address');
select test.ok(public.visit_pass('WRONGTOKENWRONGTOKENWRONGTOKEN12') is null, 'A wrong pass token shows nothing');
reset role;
set role authenticated;
select test.blocked($$select public.visit_pass('x')$$, 'permission denied', 'Browsers cannot call the pass function directly (only our server)');
reset role;
set role anon;
select test.blocked($$select public.kiosk_pair('ABCDEFGH')$$, 'permission denied', 'Signed-out visitors cannot call tablet functions directly');
reset role;

\echo '--- reception tablet pairing'
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select test.blocked(format($$select public.vms_kiosk_pairing_code(%L, 'Front desk')$$, current_setting('test.vloc')), 'Only admins', 'Staff cannot set up a tablet');
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select set_config('test.pair', public.vms_kiosk_pairing_code(current_setting('test.vloc')::uuid, 'Front desk'), false);
select test.ok(current_setting('test.pair') ~ '^[A-Z2-9]{8}$', 'Admin gets a one-time pairing code');
select test.blocked($$select token_hash from public.kiosk_devices$$, 'permission denied', 'Tablet secrets are not readable');
reset role;
set role service_role;
select test.blocked($$select public.kiosk_pair('WRONG123')$$, 'wrong or has expired', 'A wrong pairing code is refused');
select set_config('test.tok', public.kiosk_pair(lower(current_setting('test.pair')))::jsonb ->> 'token', false);
select test.ok(length(current_setting('test.tok')) = 48, 'The right code (any case) pairs the tablet');
select test.blocked(format($$select public.kiosk_pair(%L)$$, current_setting('test.pair')), 'wrong or has expired', 'A pairing code works only once');
select test.ok((public.kiosk_context(current_setting('test.tok')) -> 'location' ->> 'name') = 'Ikoyi Office', 'The tablet knows its office');
select test.ok((public.kiosk_context(current_setting('test.tok')) ->> 'photo_required')::boolean = false, 'Visitor photo is off by default');
select test.blocked($$select public.kiosk_context('not-a-token')$$, 'not set up', 'An unknown tablet is refused');

\echo '--- signing in an invited visitor'
select test.ok((public.kiosk_find_visit(current_setting('test.tok'), current_setting('test.inv')::jsonb ->> 'code') ->> 'host') = 'Ade',
  'The tablet finds the invitation by code and shows the host');
select test.blocked(format($$select public.kiosk_sign_in(%L, %L, null, null, null, null, null, null, false, null)$$,
  current_setting('test.tok'), current_setting('test.inv')::jsonb ->> 'id'), 'accept the visitor rules', 'The visitor rules must be accepted');
select set_config('test.si', public.kiosk_sign_in(current_setting('test.tok'), (current_setting('test.inv')::jsonb ->> 'id')::uuid,
  null, null, null, null, null, null, true, null)::text, false);
select test.ok((current_setting('test.si')::jsonb ->> 'status') = 'on_site', 'The invited visitor is signed in');
select test.ok((current_setting('test.si')::jsonb ->> 'host_email') = 'ade@visit.ng', 'The server gets the host’s email to send the alert');
select test.blocked(format($$select public.kiosk_sign_in(%L, %L, null, null, null, null, null, null, true, null)$$,
  current_setting('test.tok'), current_setting('test.inv')::jsonb ->> 'id'), 'can’t be used', 'The same invitation cannot sign in twice');
select test.ok((select count(*) from public.kiosk_visitors_on_site(current_setting('test.tok')) where name = 'Tolu A.') = 1,
  'The tablet’s sign-out list shows first name and initial only');

\echo '--- walk-ins, blocklist and photos'
reset role;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select public.vms_block(null, null, '+234 803 999 0000', 'Trespass');
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select test.blocked($$select public.vms_block('X', null, null, null)$$, 'Only admins', 'Staff cannot edit the blocklist');
select test.ok((select count(*) from public.visitor_blocklist) = 0, 'Staff cannot read the blocklist');
reset role;
set role service_role;
select test.ok((select count(*) from public.kiosk_hosts(current_setting('test.tok'), 'bis')) = 1, 'Walk-ins can search for their host by name');
select test.ok((select count(*) from public.kiosk_hosts(current_setting('test.tok'), 'b')) = 0, 'Host search needs at least 2 letters');
select test.ok((public.kiosk_sign_in(current_setting('test.tok'), null, 'Kola Bad', '08039990000', null, null, null,
  current_setting('test.bisi')::uuid, true, null) ->> 'status') = 'denied', 'A blocklisted phone number is refused at the tablet');
select test.ok((public.kiosk_sign_in(current_setting('test.tok'), null, 'Ngozi Walk', '0812 000 1111', 'ngozi@walk.ng', 'Delivery', 'Parcel',
  current_setting('test.bisi')::uuid, true, null) ->> 'status') = 'on_site', 'A walk-in visitor can sign in with a host');
select test.blocked(format($$select public.kiosk_sign_in(%L, null, 'Someone', null, null, null, null, %L, true, null)$$,
  current_setting('test.tok'), (select id from public.members where email = 'boss@other-visit.ng')), 'Choose who you are visiting',
  'A walk-in cannot pick a host from another company');
reset role;
update public.visitor_settings set photo_required = true where org_id = current_setting('test.vorg')::uuid;
set role service_role;
select test.blocked(format($$select public.kiosk_sign_in(%L, null, 'Femi Photo', null, null, null, null, %L, true, null)$$,
  current_setting('test.tok'), current_setting('test.bisi')), 'take a photo', 'When the company turns photos on, a photo is required');
select test.blocked(format($$select public.kiosk_sign_in(%L, null, 'Femi Photo', null, null, null, null, %L, true, 'someone-else/x.jpg')$$,
  current_setting('test.tok'), current_setting('test.bisi')), 'Photo upload is invalid', 'Photos must be stored under the company’s own folder');
select test.ok((public.kiosk_sign_in(current_setting('test.tok'), null, 'Femi Photo', null, null, null, null, current_setting('test.bisi')::uuid, true,
  current_setting('test.vorg') || '/' || gen_random_uuid() || '.jpg') ->> 'status') = 'on_site', 'With a photo, sign-in works');

\echo '--- who is on site, sign-out'
reset role;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select test.ok((select count(*) from public.vms_on_site() where kind = 'visitor') = 3, 'Admin sees all three visitors on site');
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select test.blocked($$select * from public.vms_on_site()$$, 'Only admins and managers', 'Staff cannot see the full on-site list');
reset role;
set role service_role;
select test.ok((public.kiosk_sign_out(current_setting('test.tok'), lower(current_setting('test.inv')::jsonb ->> 'code'), null) ->> 'status') = 'left',
  'The visitor signs out at the tablet with their code');
select test.blocked(format($$select public.kiosk_sign_out(%L, %L, null)$$, current_setting('test.tok'), current_setting('test.inv')::jsonb ->> 'code'),
  'couldn’t find you', 'They cannot sign out twice');

\echo '--- other companies'
reset role;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f911', 'boss@other-visit.ng');
select test.ok((select count(*) from public.visits) = 0, 'Another company sees none of these visits');
select set_config('test.opair', public.vms_kiosk_pairing_code(current_setting('test.oloc')::uuid, 'Other desk'), false);
reset role;
set role service_role;
select set_config('test.otok', public.kiosk_pair(current_setting('test.opair'))::jsonb ->> 'token', false);
select test.blocked(format($$select public.kiosk_find_visit(%L, %L)$$, current_setting('test.otok'), current_setting('test.inv')::jsonb ->> 'code'),
  'couldn’t find', 'Another company’s tablet cannot find this company’s invitation');

\echo '--- revoking a tablet, cancelling, settings'
reset role;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select public.vms_kiosk_revoke((select id from public.kiosk_devices where name = 'Front desk'));
reset role;
set role service_role;
select test.blocked(format($$select public.kiosk_context(%L)$$, current_setting('test.tok')), 'not set up', 'A switched-off tablet stops working at once');
reset role;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select set_config('test.inv2', public.vms_invite(current_setting('test.vloc')::uuid, 'Later Visitor', null, null, null, null, now() + interval '2 days')::text, false);
select public.vms_cancel((current_setting('test.inv2')::jsonb ->> 'id')::uuid);
select test.ok((select status from public.visits where id = (current_setting('test.inv2')::jsonb ->> 'id')::uuid) = 'cancelled', 'The host can cancel a visit');
select test.blocked($$select public.vms_save_settings(true, 'Rules', 30, true)$$, 'Only admins', 'Staff cannot change visitor settings');
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select public.vms_save_settings(false, 'Wear your badge at all times.', 30, true);
select test.ok((select retention_days from public.visitor_settings) = 30, 'Admin sets how long visitor details are kept');
select test.blocked($$select public.vms_save_settings(false, 'x', 3, true)$$, 'retention_days', 'Retention must be at least 7 days');

\echo '--- visitor details are deleted after the retention period'
reset role;
update public.visits set signed_out_at = now() - interval '31 days', photo_path = current_setting('test.vorg') || '/old.jpg'
 where visitor_name = 'Tolu Ade';
set role service_role;
select test.ok((select count(*) from public.vms_purge_expired() where photo_path like '%/old.jpg') = 1, 'Purge returns the photo to delete from storage');
reset role;
select test.ok((select visitor_name = 'Deleted visitor' and visitor_email is null and visitor_phone is null and pass_token_hash is null
                from public.visits where code = current_setting('test.inv')::jsonb ->> 'code'), 'Name, contact details and pass link are removed');
set role service_role;
select test.ok(public.visit_pass(current_setting('test.inv')::jsonb ->> 'pass_token') is null, 'The old pass link no longer shows anything');
reset role;

\echo '--- recovery codes find pgcrypto on Supabase'
select test.ok(exists (select 1 from pg_proc where proname = 'verify_and_consume_recovery_code'
                         and array_to_string(proconfig, ',') like '%extensions%'), 'Recovery-code functions search the extensions schema');

\o
\echo '✅ VISITOR MANAGEMENT TESTS PASSED'
