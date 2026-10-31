-- 5ime: celebrations (migration 0022). Visit Ltd (Premium).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
select set_config('test.uid', '', false);
select set_config('test.v', (select id::text from public.organizations where domain = 'visit.ng'), false);
select set_config('test.ade', (select id::text from public.members where email = 'ade@visit.ng'), false);
select set_config('test.boss', (select id::text from public.members where email = 'boss@visit.ng'), false);
select set_config('test.today', ((now() at time zone (select timezone from public.organizations where domain = 'visit.ng'))::date)::text, false);
update public.organizations set celebrations_weekend = 'same', celebrations_on = true, celebrations_email = 'all@visit.ng', celebrations_heads_up_days = 3
 where id = current_setting('test.v')::uuid;
-- Ade: birthday today, and joined 5 years ago today.
insert into public.member_private_details (member_id, org_id, birth_month, birth_day)
values (current_setting('test.ade')::uuid, current_setting('test.v')::uuid,
        extract(month from current_setting('test.today')::date), extract(day from current_setting('test.today')::date))
on conflict (member_id) do update set birth_month = excluded.birth_month, birth_day = excluded.birth_day, celebrate_opt_out = false;
update public.members set start_date = (current_setting('test.today')::date - interval '5 years')::date where id = current_setting('test.ade')::uuid;

\echo '--- who is celebrated'
select test.ok(public.birthday_on(2, 29, date '2027-02-28') and not public.birthday_on(2, 29, date '2028-02-28') and public.birthday_on(2, 29, date '2028-02-29'),
  '29 February birthdays fall on 28 February in other years');
select test.ok((select (c ->> 'birthday')::boolean and (c ->> 'years')::int = 5 from jsonb_array_elements(public.celebrations_for(current_setting('test.v')::uuid, current_setting('test.today')::date)) c
                 where c ->> 'member_id' = current_setting('test.ade')), 'Birthday and 5th work anniversary on the same day');
update public.organizations set celebrations_weekend = 'friday' where id = current_setting('test.v')::uuid;
select test.ok(cardinality(public.celebration_dates(current_setting('test.v')::uuid, date '2026-11-06')) = 3
  and cardinality(public.celebration_dates(current_setting('test.v')::uuid, date '2026-11-07')) = 0, 'Weekend celebrations move to Friday');
update public.organizations set celebrations_weekend = 'same' where id = current_setting('test.v')::uuid;

\echo '--- in the app'
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select test.ok(jsonb_array_length(public.my_celebrations_today()) >= 1, 'Colleagues see who is celebrated today');
select test.ok(not (public.my_celebrations_today() -> 0 ? 'birth_month'), 'without seeing anyone''s date of birth');
select public.send_wish(current_setting('test.ade')::uuid, 'Happy birthday, Ade!');
select test.blocked(format($$select public.send_wish(%L, 'Hi')$$, current_setting('test.boss')), 'yourself', 'No wishes to yourself');
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select test.ok((select count(*) from public.celebration_wishes) = 1, 'The person celebrated sees the wishes');
select test.blocked($$update public.member_private_details set celebrate_opt_out = true$$, 'permission denied', 'Staff change it only through the app');
reset role;
select set_config('test.uid', '', false);
select test.ok((select not celebrate_opt_out from public.member_private_details where member_id = current_setting('test.ade')::uuid), 'Opting out goes through the app only');
update public.member_private_details set celebrate_opt_out = true where member_id = current_setting('test.ade')::uuid;
select test.ok((select not (c ->> 'birthday')::boolean from jsonb_array_elements(public.celebrations_for(current_setting('test.v')::uuid, current_setting('test.today')::date)) c
                 where c ->> 'member_id' = current_setting('test.ade')), 'Opting out hides the birthday, the work anniversary stays');

\echo '--- emails'
delete from public.celebration_sends;
set role service_role;
select set_config('test.claim', public.claim_celebration_emails()::text, false);
select test.ok(
  (select count(*) from jsonb_array_elements(current_setting('test.claim')::jsonb) e where e ->> 'to' = 'all@visit.ng')
  = case when (now() at time zone (select timezone from public.organizations where id = current_setting('test.v')::uuid))::time >= '08:00' then 1 else 0 end,
  'From 8:00, one announcement goes to the group email');
select test.ok(jsonb_array_length(public.claim_celebration_emails()) = 0, 'and only once a day');
reset role;
select set_config('test.uid', '', false);
update public.member_private_details set celebrate_opt_out = false, birth_month = null, birth_day = null where member_id = current_setting('test.ade')::uuid;
update public.members set start_date = null where id = current_setting('test.ade')::uuid;
delete from public.celebration_wishes;

\o
\echo '✅ CELEBRATION TESTS PASSED'
