-- 5ime: schedule automation and holidays (migration 0020). Uses Visit Ltd (Premium) and Other Visit Ltd (Basic).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
select set_config('test.uid', '', false);
select set_config('test.v', (select id::text from public.organizations where domain = 'visit.ng'), false);
select set_config('test.o', (select id::text from public.organizations where domain = 'other-visit.ng'), false);
select set_config('test.ade', (select id::text from public.members where email = 'ade@visit.ng'), false);
select set_config('test.tz', (select timezone from public.organizations where domain = 'visit.ng'), false);
select set_config('test.today', ((now() at time zone current_setting('test.tz'))::date)::text, false);
-- A working day that started at midnight and ends late tonight, so the test works at any hour.
update public.organizations set work_start = '00:00', work_end = '23:59', grace_minutes = 0, auto_check_in = true,
       auto_check_out = true, overtime_allowed = false where id = current_setting('test.v')::uuid;
delete from public.public_holidays where day = current_setting('test.today')::date;
insert into public.schedules (org_id, member_id, weekday, mode)
  select current_setting('test.v')::uuid, null, d, 'office' from generate_series(1, 7) d
  on conflict (org_id, member_id, weekday) do update set mode = 'office';
delete from public.attendance where member_id = current_setting('test.ade')::uuid;

\echo '--- automatic check-in'
insert into public.presence_days (member_id, org_id, local_date, place, first_inside_at, last_inside_at)
values (current_setting('test.ade')::uuid, current_setting('test.v')::uuid, current_setting('test.today')::date, 'office',
        now() - interval '20 minutes', now() - interval '1 minute');
select test.ok(public.try_auto_check_in(current_setting('test.ade')::uuid) is null, 'No automatic check-in before 5 clean days of checking in yourself');
insert into public.attendance (org_id, member_id, kind, at, local_date, location_type, expected_mode, flags)
  select current_setting('test.v')::uuid, current_setting('test.ade')::uuid, k, now() - make_interval(days => d) + case k when 'in' then interval '0' else interval '1 minute' end,
         current_setting('test.today')::date - d, 'office', 'office', '{}'
    from generate_series(1, 5) d, unnest(array['in','out']) k;
select test.ok(public.auto_check_in_ready(current_setting('test.ade')::uuid), 'Five clean days earn automatic check-in');
update public.members set auto_check_in_off = true where id = current_setting('test.ade')::uuid;
select test.ok(public.try_auto_check_in(current_setting('test.ade')::uuid) is null, 'An admin can switch it off for one person');
update public.members set auto_check_in_off = false where id = current_setting('test.ade')::uuid;
set role service_role;
select test.ok((public.run_schedule_automation() ->> 'checked_in')::int >= 1, 'The scheduled run checks the person in');
reset role;
select set_config('test.uid', '', false);
select test.ok((select a.at = p.first_inside_at and 'auto' = any(a.flags) from public.attendance a
                  join public.presence_days p on p.member_id = a.member_id and p.local_date = a.local_date
                 where a.member_id = current_setting('test.ade')::uuid and a.local_date = current_setting('test.today')::date and a.kind = 'in'),
  'recorded at the time 5ime first saw them at the office, marked automatic');
select test.ok(public.try_auto_check_in(current_setting('test.ade')::uuid) is null, 'Never twice in a day');

\echo '--- red flags pause it'
update public.attendance set flags = array['out_of_range'] where member_id = current_setting('test.ade')::uuid
   and local_date = current_setting('test.today')::date - 2 and kind = 'in';
select test.ok(not public.auto_check_in_ready(current_setting('test.ade')::uuid), 'A flagged day in the last five pauses automatic check-in');
update public.attendance set flags = '{}' where member_id = current_setting('test.ade')::uuid and local_date = current_setting('test.today')::date - 2;

\echo '--- closing time, overtime off'
update public.organizations set work_end = ((now() at time zone current_setting('test.tz')) - interval '2 minutes')::time
 where id = current_setting('test.v')::uuid and ((now() at time zone current_setting('test.tz')) - interval '2 minutes')::time > '00:05';
select set_config('test.end', (((current_setting('test.today')::date + (select work_end from public.organizations where id = current_setting('test.v')::uuid))
  at time zone current_setting('test.tz')))::text, false);
select test.ok(public.try_auto_check_out(current_setting('test.ade')::uuid) = current_setting('test.end')::timestamptz,
  'Without overtime, everyone still in is checked out at closing time');

\echo '--- closing time, overtime on'
delete from public.attendance where member_id = current_setting('test.ade')::uuid and local_date = current_setting('test.today')::date and kind = 'out';
update public.organizations set overtime_allowed = true, overtime_until = '23:59' where id = current_setting('test.v')::uuid;
update public.presence_days set last_inside_at = now(), last_outside_at = null
 where member_id = current_setting('test.ade')::uuid and local_date = current_setting('test.today')::date;
select test.ok(public.try_auto_check_out(current_setting('test.ade')::uuid) is null, 'Still inside after closing: they can keep working');
update public.presence_days set last_inside_at = now() - interval '1 minute', last_outside_at = now()
 where member_id = current_setting('test.ade')::uuid and local_date = current_setting('test.today')::date;
select test.ok(public.try_auto_check_out(current_setting('test.ade')::uuid) =
  (select last_inside_at from public.presence_days where member_id = current_setting('test.ade')::uuid and local_date = current_setting('test.today')::date),
  'Leaving after closing checks them out at the time last seen inside');
select test.ok((select 'overtime' = any(flags) and 'auto' = any(flags) from public.attendance where member_id = current_setting('test.ade')::uuid and kind = 'out'
                 and local_date = current_setting('test.today')::date), 'and it counts as overtime');

\echo '--- Basic has no automatic check-in'
select set_config('test.oboss', (select id::text from public.members where email = 'boss@other-visit.ng'), false);
insert into public.presence_days (member_id, org_id, local_date, place, first_inside_at, last_inside_at)
values (current_setting('test.oboss')::uuid, current_setting('test.o')::uuid, current_setting('test.today')::date, 'office', now(), now())
on conflict do nothing;
select test.ok(public.try_auto_check_in(current_setting('test.oboss')::uuid) is null, 'Basic companies check in themselves');

\echo '--- holidays'
insert into public.public_holidays (day, name) values (current_setting('test.today')::date, 'Test Holiday');
select test.ok(public.holiday_name(current_setting('test.v')::uuid, current_setting('test.today')::date) = 'Test Holiday', 'Today is a public holiday');
insert into public.attendance (org_id, member_id, kind, at, local_date, location_type, expected_mode, flags)
  values (current_setting('test.o')::uuid, current_setting('test.oboss')::uuid, 'in', now(), current_setting('test.today')::date, 'office', 'office', array['late']);
select test.ok((select 'holiday' = any(flags) and not 'late' = any(flags) from public.attendance
                 where member_id = current_setting('test.oboss')::uuid and local_date = current_setting('test.today')::date and kind = 'in'),
  'Working on a holiday is marked, and never late');
delete from public.public_holidays where day = current_setting('test.today')::date;

set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select test.ok(public.admin_add_holiday(current_date + 10, 'Company retreat') is not null, 'A Premium admin adds a company holiday');
select test.ok((select count(*) from public.company_holidays) = 1, 'and sees it');
select test.ok((select count(*) from public.public_holidays) > 10, 'Everyone can read the public holiday list');
select test.blocked($$insert into public.public_holidays (day, name) values (current_date + 3, 'Fake')$$, 'permission denied', 'but nobody can add to it directly');
select test.blocked($$select public.console_set_public_holiday(current_date + 3, 'Fake', true, 'test')$$, 'console', 'Only Global Admin manages public holidays');
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select test.ok((select count(*) from public.presence_days) = 1, 'Staff see only their own sightings');
select test.blocked($$select public.admin_add_holiday(current_date + 11, 'Mine')$$, 'admins', 'Staff cannot add holidays');
select test.as_console('00000000-0000-0000-0000-00000000f911', 'boss@other-visit.ng');
select test.blocked($$select public.admin_add_holiday(current_date + 10, 'Party')$$, 'Pro and Premium', 'Company holidays are part of Pro and Premium');
select test.ok((select count(*) from public.company_holidays) = 0 and (select count(*) from public.presence_days where org_id = current_setting('test.v')::uuid) = 0,
  'Another company sees none of Visit Ltd’s holidays or sightings');
reset role;
select set_config('test.uid', '', false);
delete from public.attendance where member_id in (current_setting('test.ade')::uuid, current_setting('test.oboss')::uuid);
delete from public.presence_days;
update public.organizations set work_start = '09:00', work_end = '17:00', grace_minutes = 15, overtime_allowed = false where id = current_setting('test.v')::uuid;

\o
\echo '✅ SCHEDULE AUTOMATION TESTS PASSED'
