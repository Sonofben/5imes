-- 5ime: support tickets, admin emails, limit overrides, data requests, operations (migration 0030).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
reset role;
select set_config('test.uid', '', false);
select set_config('test.o', (select id::text from public.organizations where domain = 'other-visit.ng'), false);
select set_config('test.v', (select id::text from public.organizations where domain = 'visit.ng'), false);

\echo '--- support tickets'
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select test.blocked($$select public.open_support_ticket('Cannot check in', 'problem', 'high', 'GPS keeps failing')$$, 'company admins', 'Staff cannot open tickets');
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select set_config('test.t', public.open_support_ticket('Cannot check in', 'problem', 'high', 'GPS keeps failing at Ikoyi')::text, false);
select test.ok((select count(*) = 1 from public.support_tickets), 'An admin opens a ticket and sees it');
select test.as_console('00000000-0000-0000-0000-00000000f911', 'boss@other-visit.ng');
select test.ok((select count(*) = 0 from public.support_tickets), 'Another company cannot see it');
select test.blocked(format($$select public.reply_support_ticket(%L, 'hi')$$, current_setting('test.t')), 'not found', 'or reply to it');
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select test.ok((select count(*) = 1 from public.console_support_tickets('active', null)), 'Global Admin sees the ticket');
select public.console_reply_ticket(current_setting('test.t')::uuid, 'Internal: check their location radius', true, null, true);
select test.ok(public.console_reply_ticket(current_setting('test.t')::uuid, 'Please widen the office area to 250 m', false, null, false) = 'boss@visit.ng',
  'A reply returns the opener to email');
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select test.ok((select count(*) = 2 from public.support_messages), 'The company sees replies but not internal notes');
select test.ok((select status = 'waiting_on_customer' from public.support_tickets), 'The ticket waits on the customer');
select public.reply_support_ticket(current_setting('test.t')::uuid, 'That fixed it, thanks', true);
select test.ok((select status = 'closed' from public.support_tickets), 'The customer can close it');

\echo '--- admin emails'
select test.as_console('00000000-0000-0000-0000-0000000000c2', 'helpdesk@koraforge.com');
select test.blocked($$select * from public.console_broadcast_recipients('all', null, null)$$, 'cannot do this', 'Read-only admins cannot email companies');
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select test.ok((select count(*) >= 1 from public.console_broadcast_recipients('company', null, current_setting('test.v')::uuid) where email = 'boss@visit.ng'),
  'Recipients for one company are its admins');
select test.ok((select count(*) = 0 from public.console_broadcast_recipients('company', null, current_setting('test.v')::uuid) where email = 'ade@visit.ng'),
  'and not its staff');

\echo '--- limit overrides'
reset role;
select set_config('test.uid', '', false);
select test.ok(public.org_limit(current_setting('test.o')::uuid, 'basic', 'staff') = 15, 'Basic allows 15 staff by default');
set role authenticated;
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select public.console_set_limits(current_setting('test.o')::uuid, 20, null, null, 6, 'Seasonal staff', 'Agreed with client for festive season');
reset role;
select set_config('test.uid', '', false);
select test.ok(public.org_limit(current_setting('test.o')::uuid, 'basic', 'staff') = 20, 'An override raises the limit for one company');
select test.ok(public.org_limit(current_setting('test.v')::uuid, 'basic', 'staff') = 15, 'and only that company');
update public.org_limit_overrides set ends_at = now() - interval '1 minute' where org_id = current_setting('test.o')::uuid;
select test.ok(public.org_limit(current_setting('test.o')::uuid, 'basic', 'staff') = 15, 'When it ends the plan limit applies again');
delete from public.org_limit_overrides;

\echo '--- data requests'
set role authenticated;
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select set_config('test.dr', public.console_save_data_request(null, '{"requester_name":"Ada Eze","requester_email":"ada@x.ng","kind":"access","received_at":"2026-10-01"}'::jsonb, 'Email to privacy mailbox')::text, false);
select test.ok((select due_at = date '2026-10-31' from public.console_data_requests(true)), 'A request is due 30 days after it arrives');
select public.console_save_data_request(current_setting('test.dr')::uuid, '{"status":"completed","outcome":"Export sent"}'::jsonb, 'Closed after export');
select test.ok((select count(*) = 0 from public.console_data_requests(true)), 'Completed requests leave the open list');
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select test.blocked($$select * from public.console_data_requests(false)$$, 'Console access', 'Companies cannot read the tracker');

\echo '--- operations'
reset role;
select set_config('test.uid', '', false);
set role service_role;
insert into public.job_runs (job, finished_at, ok) values ('schedule', now(), true);
insert into public.email_log (kind, to_domain, ok) values ('visitor_invite', 'visit.ng', false);
reset role;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-0000000000c2', 'helpdesk@koraforge.com');
select test.ok((public.console_operations() -> 'emails' ->> 'failed_24h')::int = 1, 'The health page counts failed emails');
reset role;
select set_config('test.uid', '', false);
delete from public.support_tickets; delete from public.data_requests; delete from public.job_runs; delete from public.email_log;
\o
\echo '✅ SUPPORT AND OPERATIONS TESTS PASSED'
