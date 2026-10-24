-- 5ime: rate limits, logo link and table-level guards.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000e901', 'boss@limits.ng'),
  ('00000000-0000-0000-0000-00000000e902', 'ada@limits.ng');

-- Pre-fill a counter so a test can reach a limit without hundreds of calls.
create or replace function test.fill_limit(p_bucket text, p_subject text, p_window interval, p_hits integer)
returns void language sql as $$
  insert into public.rate_limits (bucket, subject, window_start, window_seconds, max_hits, hits)
  values (p_bucket, p_subject,
          to_timestamp(floor(extract(epoch from clock_timestamp()) / extract(epoch from p_window)) * extract(epoch from p_window)),
          extract(epoch from p_window)::int, p_hits, p_hits)
  on conflict (bucket, subject, window_start) do update set hits = excluded.hits;
$$;

\echo '--- every limited database function still starts with its limit'
select test.ok(position('rate_limit_hit(' in pg_get_functiondef(f::regprocedure)) > 0, 'Limit present in ' || f)
  from unnest(array[
    'public.create_organization(text)', 'public.join_organization()', 'public.invite_member(text,text,text,text)',
    'public.invite_members_bulk(jsonb)', 'public.check_in(text,double precision,double precision,double precision,text)',
    'public.report_presence(double precision,double precision,double precision)',
    'public.request_work_elsewhere(double precision,double precision,double precision,text,text,text)',
    'public.request_home_location(double precision,double precision,double precision)',
    'public.request_home_location(double precision,double precision,double precision,text)',
    'public.request_attendance_correction(date,time without time zone,time without time zone,text)',
    'public.verify_and_consume_recovery_code(text)', 'public.replace_recovery_codes(text[])', 'public.grant_support_access(integer)',
    'public.prepare_paystack_subscription(text,text,integer,integer,boolean)', 'public.prepare_paystack_seat_increase(text,integer)',
    'public.console_invite_member(uuid,text,text,text)', 'public.console_create_company(text,text,text,text,integer,text)',
    'public.console_team_add(text,text,text)', 'public.console_company_export(uuid,text)', 'public.console_company_snapshot(uuid)',
    'public.console_find_person(text)', 'public.console_force_signout(uuid,text)', 'public.console_set_locked(uuid,boolean,text)',
    'public.console_reset_mfa(uuid,text)',
    'public.vms_desk_find(text)', 'public.vms_admit(uuid,uuid)', 'public.vms_turn_away(uuid,text)', 'public.vms_set_reception(uuid,boolean)',
    'public.vms_visitor_link(uuid)', 'public.vms_rotate_visitor_link(uuid)', 'public.vms_log_export(date,date)',
    'public.vms_update_settings(boolean,text,integer,boolean,boolean,boolean,boolean,text,integer)',
    'public.vms_find_visitor(text)', 'public.vms_forget_visitor(text)', 'public.vms_cancel(uuid)',
    'public.walkin_submit(text,text,text,text,text,text,text,text,text,boolean)', 'public.visit_checkin(text,text,text,text,boolean)',
    'public.visit_sign_out(text)']) as f;

\echo '--- the counters are private'
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000e901', 'boss@limits.ng');
select test.blocked($$select * from public.rate_limits$$, 'permission denied', 'Signed-in users cannot read the counters');
select test.blocked($$select public.rate_limit_hit('x', 'u:someone-else', 1000000, interval '1 hour')$$, 'permission denied', 'Users cannot write a counter or pick its subject');
select test.blocked($$select public.throttle('made_up')$$, 'Unknown limit', 'Only known limits can be used');
reset role;
set role anon;
select test.blocked($$select public.throttle('report_export')$$, 'permission denied', 'Signed-out visitors cannot call throttle');
reset role;

\echo '--- workspace creation: 3 per person per day'
select test.fill_limit('workspace_create', 'u:00000000-0000-0000-0000-00000000e901', interval '1 day', 3);
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000e901', 'boss@limits.ng');
select test.blocked($$select public.create_organization('Limits Ltd')$$, 'Too many attempts', 'A 4th workspace in one day is refused');
reset role;
delete from public.rate_limits where bucket = 'workspace_create';
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000e901', 'boss@limits.ng');
select public.create_organization('Limits Ltd');
select test.ok(public.my_org_id() is not null, 'Within the limit, the workspace is created');

\echo '--- invites: 600 per company per day, bulk counts every person'
reset role;
select test.fill_limit('invite', 'o:' || (select id from public.organizations where domain = 'limits.ng'), interval '1 day', 599);
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000e901', 'boss@limits.ng');
select public.invite_member('ada@limits.ng', 'Ada', 'staff');
select test.ok((select count(*) from members where email = 'ada@limits.ng') = 1, 'The 600th invite of the day goes through');
select test.blocked($$select public.invite_member('bola@limits.ng', 'Bola', 'staff')$$, 'Too many attempts', 'The 601st invite is refused');
select test.blocked($$select public.invite_members_bulk('[{"email":"c1@limits.ng"},{"email":"c2@limits.ng"}]'::jsonb)$$, 'Too many attempts', 'A bulk import over the limit is refused');
select test.ok((select count(*) from members where email in ('bola@limits.ng','c1@limits.ng','c2@limits.ng')) = 0, 'Nothing is added when the limit refuses');

\echo '--- recovery codes: wrong guesses count, 6th try in 15 minutes is refused'
select test.as_user('00000000-0000-0000-0000-00000000e901', 'boss@limits.ng');
select test.ok(public.verify_and_consume_recovery_code('WRONG-CODE-' || g) = false, 'Wrong code ' || g || ' is rejected') from generate_series(1, 5) g;
select test.blocked($$select public.verify_and_consume_recovery_code('WRONG-CODE-6')$$, 'Too many attempts', 'Guessing stops after 5 tries');
reset role;
select test.ok((select hits from public.rate_limits where bucket = 'recovery_try' and subject = 'u:00000000-0000-0000-0000-00000000e901') = 5,
  'Failed guesses are counted, not rolled back');

\echo '--- web app limits'
select test.fill_limit('report_export', 'u:00000000-0000-0000-0000-00000000e901', interval '1 hour', 30);
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000e901', 'boss@limits.ng');
select test.blocked($$select public.throttle('report_export')$$, 'Too many attempts', 'The 31st report export in an hour is refused');
select test.as_user('00000000-0000-0000-0000-00000000e902', 'ada@limits.ng');
select public.throttle('report_export');
select test.ok(true, 'Another person''s allowance is separate');
reset role;
create or replace function test.limit_errcode() returns text language plpgsql as $f$
begin
  perform public.rate_limit_hit('errcode_check', 'u:x', 0, interval '1 hour');
  return 'none';
exception when others then return sqlstate;
end $f$;
select test.ok(test.limit_errcode() = 'KF429', 'Limit errors carry code KF429 so the app can show a friendly message');

\echo '--- Global Admin sees who hit a limit; companies cannot'
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000e901', 'boss@limits.ng');
select test.blocked($$select * from public.console_rate_limits()$$, 'Console access', 'Company admins cannot see the limits list');
select test.as_console('00000000-0000-0000-0000-0000000000c2', 'helpdesk@koraforge.com');
select test.ok((select count(*) from public.console_rate_limits() where bucket = 'recovery_try' and who = 'boss@limits.ng') = 1,
  'Global Admin sees the recovery-code lockout with the person''s email');
reset role;

\echo '--- every table in the public schema has row-level security on'
select test.ok(false, 'Row-level security is OFF on public.' || c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
select test.ok(true, 'All public tables have row-level security');

\o
\echo '✅ RATE LIMIT + HARDENING TESTS PASSED'
