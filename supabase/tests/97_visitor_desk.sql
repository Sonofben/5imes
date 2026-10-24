-- 5ime: visitor check-in from the visitor's phone, reception desk, audit trail, reports (migration 0016).
-- Runs after 96_visitors.sql and reuses its companies: Visit Ltd (boss, Ade, Bisi) and Other Visit Ltd.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
update public.visitor_settings set require_admit = true, auto_admit_invited = false, office_hours_only = false, retention_days = 90
 where org_id = current_setting('test.vorg')::uuid;
update public.visitor_blocklist set phone = '+234 803 999 0000' where org_id = current_setting('test.vorg')::uuid;

\echo '--- reception desk access'
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select test.blocked($$select public.vms_desk_find('ABCDEFGH')$$, 'Only reception', 'Ordinary staff cannot use the visitor desk');
select test.blocked(format($$select public.vms_set_reception(%L, true)$$, current_setting('test.ade')), 'Only admins', 'Staff cannot give themselves desk access');
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select public.vms_set_reception(current_setting('test.ade')::uuid, true);
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select test.ok(public.is_visitor_desk(), 'An admin gives Ade reception desk access');
select test.ok((select count(*) from public.vms_hosts()) = 3, 'Reception sees colleague names to pick a host');
select test.as_console('00000000-0000-0000-0000-00000000f903', 'bisi@visit.ng');
select test.blocked($$select * from public.vms_hosts()$$, 'Only reception', 'Other staff cannot list colleagues this way');
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select test.ok((select count(*) from public.visitor_audit) = 0, 'Reception staff cannot read the audit trail');
select test.ok((select count(*) from public.visitor_links) = 0, 'Reception staff cannot see the visitor link settings');

\echo '--- an invited visitor checks in from the email link'
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select set_config('test.k', public.vms_invite(current_setting('test.vloc')::uuid, 'Kunle Ajayi', 'Kunle@Example.com', '0809 123 4567', 'Andela', 'Demo', now() + interval '30 minutes')::text, false);
reset role;
set role service_role;
select test.blocked(format($$select public.visit_checkin(%L, 'WRONG123', null, null, true)$$, current_setting('test.k')::jsonb ->> 'pass_token'),
  'doesn’t match', 'A wrong code is refused');
select test.blocked(format($$select public.visit_checkin(%L, %L, null, null, false)$$, current_setting('test.k')::jsonb ->> 'pass_token', current_setting('test.k')::jsonb ->> 'code'),
  'accept the visitor rules', 'Rules and privacy notice must be accepted');
select test.blocked(format($$select public.visit_checkin('not-a-token', %L, null, null, true)$$, current_setting('test.k')::jsonb ->> 'code'),
  'not valid', 'A made-up pass link is refused');
select test.ok((public.visit_checkin(current_setting('test.k')::jsonb ->> 'pass_token',
  lower(substr(current_setting('test.k')::jsonb ->> 'code', 1, 4)) || ' ' || substr(current_setting('test.k')::jsonb ->> 'code', 5), '0809 000 0000', null, true) ->> 'status') = 'waiting',
  'The right code (any case, with a space) checks the visitor in; they wait for reception');
select test.ok((public.visit_checkin(current_setting('test.k')::jsonb ->> 'pass_token', 'anything', null, null, true) ->> 'status') = 'waiting',
  'Checking in twice just shows the same waiting status');
select test.ok((public.visit_pass(current_setting('test.k')::jsonb ->> 'pass_token') ->> 'status') = 'waiting', 'The pass page shows they are waiting');
select test.ok((public.visit_pass(current_setting('test.k')::jsonb ->> 'pass_token') ->> 'phone') = '0809 000 0000', 'The phone number they confirmed is kept');

\echo '--- reception admits them'
reset role;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select test.ok((public.vms_desk_find(current_setting('test.k')::jsonb ->> 'code') ->> 'status') = 'waiting', 'Reception finds the visitor by code');
select set_config('test.adm', public.vms_admit((current_setting('test.k')::jsonb ->> 'id')::uuid)::text, false);
select test.ok((current_setting('test.adm')::jsonb ->> 'status') = 'on_site', 'Reception admits the visitor');
select test.ok((current_setting('test.adm')::jsonb ->> 'host_email') = 'boss@visit.ng', 'The server gets the host email for the arrival alert');
select test.ok((select decided_by = current_setting('test.ade')::uuid from public.visits where id = (current_setting('test.k')::jsonb ->> 'id')::uuid),
  'The visit records who admitted it');
select test.blocked(format($$select public.vms_admit(%L)$$, current_setting('test.k')::jsonb ->> 'id'), 'not waiting', 'A visitor cannot be admitted twice');

\echo '--- invited visitors let straight in, when the company chooses'
reset role;
update public.visitor_settings set auto_admit_invited = true where org_id = current_setting('test.vorg')::uuid;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select set_config('test.k2', public.vms_invite(current_setting('test.vloc')::uuid, 'Halima Musa', null, null, null, null, now())::text, false);
reset role;
set role service_role;
select test.ok((public.visit_checkin(current_setting('test.k2')::jsonb ->> 'pass_token', current_setting('test.k2')::jsonb ->> 'code', null, null, true) ->> 'status') = 'on_site',
  'With "let invited visitors in" on, checking in admits them at once');
reset role;
update public.visitor_settings set auto_admit_invited = false where org_id = current_setting('test.vorg')::uuid;

\echo '--- the office visitor link (QR poster)'
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f903', 'bisi@visit.ng');
select test.blocked(format($$select public.vms_visitor_link(%L)$$, current_setting('test.vloc')), 'Only admins', 'Staff cannot get the visitor link');
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select set_config('test.link', public.vms_visitor_link(current_setting('test.vloc')::uuid), false);
select test.ok(current_setting('test.link') ~ '^[A-Z2-9]{10}$', 'Each office gets a private 10-character link');
select test.ok(public.vms_visitor_link(current_setting('test.vloc')::uuid) = current_setting('test.link'), 'Asking again gives the same link (posters keep working)');
select test.blocked(format($$select public.vms_visitor_link(%L)$$, current_setting('test.oloc')), 'Choose one of your offices', 'An admin cannot make a link for another company’s office');
reset role;
set role service_role;
select test.ok((public.walkin_context(lower(current_setting('test.link'))) ->> 'location') = 'Ikoyi Office', 'The link opens the office’s visitor form');
select test.ok(public.walkin_context('NOTALINK00') is null, 'A made-up link shows nothing');

\echo '--- a walk-in visitor signs in on their phone'
select test.blocked(format($$select public.walkin_submit(%L, 'ip1', 'Amaka Eze', '0805 123 4567', null, 'MTN', null, null, null, true)$$, current_setting('test.link')),
  'reason for your visit', 'The reason for the visit is required');
select test.blocked(format($$select public.walkin_submit(%L, 'ip1', 'Amaka Eze', '12', null, 'MTN', 'meeting', null, null, true)$$, current_setting('test.link')),
  'phone number', 'A phone number is required');
select test.blocked(format($$select public.walkin_submit(%L, 'ip1', 'Amaka Eze', '0805 123 4567', null, 'MTN', 'meeting', null, null, false)$$, current_setting('test.link')),
  'accept the visitor rules', 'Rules and privacy notice must be accepted');
select set_config('test.w', public.walkin_submit(current_setting('test.link'), 'ip1', 'Amaka Eze', '0805 123 4567', null, 'MTN', 'meeting', null, 'Ade', true)::text, false);
select test.ok((current_setting('test.w')::jsonb ->> 'status') = 'waiting' and length(current_setting('test.w')::jsonb ->> 'pass_token') = 32,
  'The walk-in waits for reception and gets a private status link');
reset role;
select test.ok((select walk_in and host_hint = 'Ade' and arrival_source = 'qr' and host_member_id is null and reason = 'meeting'
                  from public.visits where visitor_name = 'Amaka Eze'), 'The host they typed is a hint for reception, not a lookup of staff');
set role service_role;
select test.ok((public.walkin_submit(current_setting('test.link'), 'ip2', 'Kola Bad', '08039990000', null, null, 'other', null, null, true) ->> 'status') = 'denied',
  'Someone on the blocklist is refused');
select test.blocked(format($$select public.walkin_submit('NOTALINK00', 'ip1', 'X Y', '08051234567', null, null, 'meeting', null, null, true)$$),
  'no longer works', 'A made-up link cannot create visits');

\echo '--- reception admits or turns away walk-ins'
reset role;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select test.ok((public.vms_admit((select id from public.visits where visitor_name = 'Amaka Eze'), current_setting('test.ade')::uuid) ->> 'host_name') = 'Ade',
  'Reception admits the walk-in and picks the host');
reset role;
set role service_role;
select set_config('test.w2', public.walkin_submit(current_setting('test.link'), 'ip3', 'Musa Bello', '0703 555 0101', null, 'GIG', 'delivery', null, null, true)::text, false);
reset role;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select public.vms_turn_away((select id from public.visits where visitor_name = 'Musa Bello'), 'No delivery expected');
select test.ok((select status from public.visits where visitor_name = 'Musa Bello') = 'denied', 'Reception can turn a visitor away');
reset role;
set role service_role;
select test.ok((public.visit_pass(current_setting('test.w2')::jsonb ->> 'pass_token') ->> 'status') = 'denied', 'The visitor’s phone shows they should speak to reception');

\echo '--- office hours and changing the link'
reset role;
select set_config('test.oldhours', (select work_start::text || '|' || work_end::text from public.organizations where id = current_setting('test.vorg')::uuid), false);
update public.visitor_settings set office_hours_only = true where org_id = current_setting('test.vorg')::uuid;
update public.organizations set work_start = ((now() at time zone timezone)::time + interval '6 hours'),
                                work_end   = ((now() at time zone timezone)::time + interval '7 hours')
 where id = current_setting('test.vorg')::uuid;
set role service_role;
select test.ok(not (public.walkin_context(current_setting('test.link')) ->> 'open')::boolean, 'Outside office hours the form says sign-in is closed');
select test.blocked(format($$select public.walkin_submit(%L, 'ip4', 'Late Visitor', '08051112222', null, null, 'meeting', null, null, true)$$, current_setting('test.link')),
  'closed right now', 'and refuses sign-ins');
reset role;
update public.organizations set work_start = split_part(current_setting('test.oldhours'), '|', 1)::time,
                                work_end   = split_part(current_setting('test.oldhours'), '|', 2)::time
 where id = current_setting('test.vorg')::uuid;
update public.visitor_settings set office_hours_only = false where org_id = current_setting('test.vorg')::uuid;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select set_config('test.link2', public.vms_rotate_visitor_link(current_setting('test.vloc')::uuid), false);
reset role;
set role service_role;
select test.ok(public.walkin_context(current_setting('test.link')) is null and public.walkin_context(current_setting('test.link2')) is not null,
  'Replacing the link stops the old poster working');

\echo '--- the reception tablet also waits for reception'
reset role;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select set_config('test.pair2', public.vms_kiosk_pairing_code(current_setting('test.vloc')::uuid, 'Desk tablet'), false);
reset role;
set role service_role;
select set_config('test.tok', public.kiosk_pair(current_setting('test.pair2'))::jsonb ->> 'token', false);
select test.ok((public.kiosk_sign_in(current_setting('test.tok'), null, 'Tablet Walker', '0812 333 4444', null, null, null, current_setting('test.bisi')::uuid, true, null)
                ->> 'status') = 'waiting', 'A tablet sign-in waits for reception when approval is on');

\echo '--- visitors sign themselves out'
select public.visit_sign_out(current_setting('test.k')::jsonb ->> 'pass_token');
select test.ok((select status from public.visits where id = (current_setting('test.k')::jsonb ->> 'id')::uuid) = 'left', 'A visitor can sign out from their phone');
select test.blocked(format($$select public.visit_sign_out(%L)$$, current_setting('test.k')::jsonb ->> 'pass_token'), 'not signed in', 'Only once');

\echo '--- other companies and signed-out users'
reset role;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f911', 'boss@other-visit.ng');
select test.blocked(format($$select public.vms_desk_find(%L)$$, current_setting('test.k2')::jsonb ->> 'code'), 'No visitor has that code', 'Another company cannot look up our visitors');
select test.blocked(format($$select public.vms_admit(%L)$$, current_setting('test.k2')::jsonb ->> 'id'), 'not found', 'or admit them');
select test.ok((select count(*) from public.visitor_links) = 0, 'or see our visitor links');
select test.ok((select count(*) from public.visitor_audit) = 0, 'or our audit trail');
select test.blocked($$select public.walkin_context('x')$$, 'permission denied', 'Phone sign-in functions are for the server only');
reset role;
set role anon;
select test.blocked($$select public.visit_checkin('x', 'y', null, null, true)$$, 'permission denied', 'Signed-out callers cannot check in directly');
reset role;

\echo '--- audit trail'
select test.ok((select count(*) from public.visitor_audit where org_id = current_setting('test.vorg')::uuid and action = 'admitted') >= 3, 'Admissions are recorded');
select test.ok((select count(*) from public.visitor_audit where org_id = current_setting('test.vorg')::uuid and action = 'arrived' and actor = 'visitor') >= 2, 'Phone check-ins are recorded as the visitor');
select test.ok((select count(*) from public.visitor_audit a where exists (select 1 from public.visits v where v.org_id = a.org_id and v.visitor_name <> 'Deleted visitor'
                  and a.detail ilike '%' || v.visitor_name || '%')) = 0, 'The audit trail never contains visitor names');
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select test.ok((select count(*) from public.visitor_audit where action = 'turned_away') >= 2, 'Admins can read the audit trail');
select public.vms_log_export(current_date - 7, current_date);
select test.ok(exists (select 1 from public.visitor_audit where action = 'exported'), 'Exports are recorded');

\echo '--- reports'
select set_config('test.rep', public.vms_report(current_date - 7, current_date)::text, false);
select test.ok((current_setting('test.rep')::jsonb ->> 'total')::int >= 3, 'The report counts visitors who came in');
select test.ok(jsonb_array_length(current_setting('test.rep')::jsonb -> 'by_weekday') = 7, 'with a count for each weekday');
select test.ok((current_setting('test.rep')::jsonb ->> 'turned_away')::int >= 2, 'and how many were turned away');
select test.blocked($$select public.vms_report(current_date, current_date - 1)$$, 'up to one year', 'The period must make sense');
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select test.blocked($$select public.vms_report(current_date - 7, current_date)$$, 'Only managers', 'Reception staff do not see reports');

\echo '--- settings'
select test.blocked($$select public.vms_update_settings(false, 'Rules', 90, true, true, false, true, 'Notice', 30)$$, 'Only admins', 'Staff cannot change visitor settings');
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select test.blocked($$select public.vms_update_settings(false, 'Rules', 30, true, true, false, true, 'Notice', 60)$$, 'longer than', 'Photos cannot outlive the rest of the record');
select public.vms_update_settings(false, 'Wear your badge.', 60, true, true, false, false, 'We keep your details for 60 days.', 14);
select test.ok((select retention_days = 60 and photo_retention_days = 14 and privacy_notice like 'We keep%' from public.visitor_settings), 'Admin saves the privacy notice and retention periods');

\echo '--- a visitor asks to see or erase their data'
select test.blocked($$select * from public.vms_find_visitor('Kunle')$$, 'full email address or phone', 'Lookups need a full email or phone number');
select test.ok((select count(*) from public.vms_find_visitor('kunle@example.COM')) = 1, 'Admin finds the visitor’s records by email');
select test.ok((select count(*) from public.vms_find_visitor('+234 805 123 4567')) = 1, 'or by phone, in any format');
select * from public.vms_forget_visitor('kunle@example.com');
reset role;
select test.ok((select visitor_name = 'Deleted visitor' and visitor_phone is null from public.visits where id = (current_setting('test.k')::jsonb ->> 'id')::uuid),
  'Erasing removes their details');
set role service_role;
select test.ok(public.visit_pass(current_setting('test.k')::jsonb ->> 'pass_token') is null, 'and their pass link');
reset role;
select test.ok(exists (select 1 from public.visitor_audit where action = 'data_deleted'), 'The erasure is recorded');

\echo '--- housekeeping'
update public.visits set signed_in_at = now() - interval '20 hours' where visitor_name = 'Amaka Eze';
update public.visits set arrived_at = now() - interval '13 hours' where visitor_name = 'Tablet Walker';
set role service_role;
select count(*) from public.vms_purge_expired();
reset role;
select test.ok((select status = 'left' and auto_signed_out from public.visits where visitor_name = 'Amaka Eze'), 'Visitors nobody signed out are closed after 16 hours');
select test.ok((select status from public.visits where visitor_name = 'Tablet Walker') = 'cancelled', 'Requests nobody answered are closed after 12 hours');

\o
\echo '✅ VISITOR DESK TESTS PASSED'
