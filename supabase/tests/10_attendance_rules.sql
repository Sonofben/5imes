-- 5ime database rule tests.
-- Each check prints "PASS: …". The first failure stops the run with "FAIL: …".
-- Run after all migrations, against a THROWAWAY Postgres (CI does this automatically), never your real Supabase project:
--   psql -v ON_ERROR_STOP=1 -f 00_supabase_stub.sql -f ../migrations/0001_init.sql -f 10_attendance_rules.sql
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;
\o /dev/null

create schema test;
grant usage on schema test to authenticated;

create function test.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end $$;

create function test.blocked(q text, pat text, label text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if sqlerrm ilike '%' || pat || '%' then
      raise notice 'PASS: %', label;
      return;
    end if;
    raise exception 'FAIL: % (wrong error: %)', label, sqlerrm;
  end;
  raise exception 'FAIL: % (it was allowed)', label;
end $$;

create function test.as_user(uid text, email text) returns void language plpgsql as $$
begin
  perform set_config('test.uid', uid, false);
  perform set_config('test.jwt', json_build_object('email', email, 'user_metadata', json_build_object('full_name', split_part(email, '@', 1)))::text, false);
end $$;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a'),  -- boss@acme.ng (owner)
  ('00000000-0000-0000-0000-00000000000b'),  -- tunde@acme.ng (invited staff)
  ('00000000-0000-0000-0000-00000000000c'),  -- kemi@acme.ng (walk-in, pending)
  ('00000000-0000-0000-0000-00000000000d'),  -- someone@gmail.com
  ('00000000-0000-0000-0000-00000000000e');  -- ceo@other.ng (different company)

set role authenticated;

\echo '--- Sign-up rules'
select test.as_user('00000000-0000-0000-0000-00000000000d', 'someone@gmail.com');
select test.ok(join_organization() ->> 'status' = 'public_email', 'Gmail user is told to use a company email');
select test.blocked($$select create_organization('Gmail Co')$$, 'company email', 'Gmail user cannot create a company');

select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.ok(join_organization() ->> 'status' = 'no_org', 'New company email is sent to company setup');
select test.ok(create_organization('Acme Ltd') is not null, 'Owner creates a company');
select test.ok((select domain from organizations) = 'acme.ng', 'Company domain is taken from the owner''s email');
select test.ok((select status = 'trialing' and plan = 'pro'
                  and trial_ends_at between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour'
                from subscriptions), '14-day Pro trial starts');
select test.ok((select count(*) from schedules) = 7, 'Default weekly schedule is created');

-- make check-in results independent of the day/time the tests run
update organizations set work_start = '23:59', work_end = '00:00', grace_minutes = 0;
update schedules set mode = 'office';
insert into locations (org_id, name, lat, lng, radius_m) values (my_org_id(), 'HQ Ikeja', 6.6018, 3.3515, 150);
select test.ok((select count(*) from locations) = 1, 'Admin adds an office');

\echo '--- Invites'
select test.blocked($$select invite_member('x@other.com', 'X')$$, 'is not a @acme.ng', 'Invite from another domain is refused');
select test.ok(invite_member('Tunde@acme.ng', 'Tunde', 'staff', 'Eng') is not null, 'Admin invites a staff member');
select test.blocked($$select invite_member('tunde@acme.ng', 'Tunde')$$, 'already been added', 'Same person cannot be invited twice');

\echo '--- Staff check-in'
select test.as_user('00000000-0000-0000-0000-00000000000b', 'tunde@acme.ng');
select test.ok(join_organization() ->> 'status' = 'active', 'Invited staff is active on first sign-in');
select test.ok((select count(*) from members) = 1, 'Staff can only see their own record');
select test.ok((select location_type = 'office' and flags = '{}' and distance_m < 30
                from check_in('in', 6.6019, 3.3516, 20, 'test')), 'Check-in inside the office radius counts as office');
select test.blocked($$select check_in('in', 6.6019, 3.3516, 20)$$, 'already checked in', 'Double check-in is refused');
select test.blocked($$insert into attendance (org_id, member_id, kind, local_date, location_type)
                      select org_id, id, 'in', current_date, 'office' from members$$,
                    'row-level security', 'Staff cannot write attendance directly');
do $$ declare n int; begin
  update members set role = 'admin'; get diagnostics n = row_count;
  perform test.ok(n = 0, 'Staff cannot promote themselves');
end $$;
select test.blocked($$select request_home_location(6.5, 3.3, 500)$$, 'accuracy is too low', 'Home pin with weak GPS is refused');
select request_home_location(6.5, 3.3, 15);
select test.ok((select home_req_lat is not null and home_lat is null from member_private_locations), 'Home pin is saved as pending, not usable yet');

\echo '--- Walk-in from the company domain'
select test.as_user('00000000-0000-0000-0000-00000000000c', 'kemi@acme.ng');
select test.ok(join_organization() ->> 'status' = 'pending', 'Uninvited colleague joins as pending');
select test.blocked($$select check_in('in', 6.6018, 3.3515, 10)$$, 'not active', 'Pending person cannot check in');

\echo '--- Admin approvals and guards'
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.ok((select count(*) from members) = 3, 'Admin sees everyone in the company');
select review_home_location((select id from members where email = 'tunde@acme.ng'), true);
select test.ok((select p.home_lat = 6.5 and m.home_status = 'approved' from members m join member_private_locations p on p.member_id = m.id where m.email = 'tunde@acme.ng'), 'Admin approves a home location');
update members set status = 'active' where email = 'kemi@acme.ng';
select test.ok((select status from members where email = 'kemi@acme.ng') = 'active', 'Admin approves a pending person');
select test.blocked($$update members set role = 'staff' where role = 'owner'$$, 'owner cannot be demoted', 'Owner cannot be demoted');
select test.blocked($$update organizations set domain = 'evil.com'$$, 'permission denied', 'Company domain cannot be changed');
do $$ declare n int; begin
  update subscriptions set status = 'active', current_period_end = now() + interval '1 year'; get diagnostics n = row_count;
  perform test.ok(n = 0, 'Admin cannot mark their own subscription as paid');
end $$;

\echo '--- Home check-out and flags'
select test.as_user('00000000-0000-0000-0000-00000000000b', 'tunde@acme.ng');
select test.ok((select location_type = 'home' and 'wrong_location' = any(flags)
                from check_in('out', 6.5001, 3.3001, 10)), 'Checking out from home on an office day is flagged');
select test.ok((select location_type = 'none' and 'out_of_range' = any(flags) and 'low_accuracy' = any(flags)
                from check_in('in', 7.0, 4.0, 300)), 'Check-in far from office and home is flagged out of range + weak GPS');

\echo '--- Tenant isolation'
select test.as_user('00000000-0000-0000-0000-00000000000e', 'ceo@other.ng');
select create_organization('Other Ltd');
select test.ok((select count(*) from members) = 1, 'Another company sees only its own people');
select test.ok((select count(*) from attendance) = 0, 'Another company sees none of Acme''s attendance');
select test.ok((select count(*) from locations) = 0, 'Another company sees none of Acme''s offices');
select test.blocked($$select review_home_location((select id from members where email = 'tunde@acme.ng'), true)$$,
                    'No pending home', 'Another company cannot approve Acme staff');

\echo '--- Plans and billing'
reset role;
update subscriptions s set plan = 'basic' from organizations o where o.id = s.org_id and o.domain = 'acme.ng';
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000000a', 'boss@acme.ng');
select test.blocked($$insert into locations (org_id, name, lat, lng) values (my_org_id(), 'Branch', 6.4, 3.4)$$,
                    'Basic plan includes 1 office', 'Basic plan is limited to one office');
update locations set radius_m = 900;
select test.ok((select radius_m from locations) = 200, 'Basic plan radius stays at 200m');
select test.blocked($$select invite_member('mgr@acme.ng', 'Mgr', 'manager')$$, 'Pro feature', 'Manager role needs Pro');

reset role;
update subscriptions s set plan = 'pro', trial_ends_at = now() - interval '1 day'
  from organizations o where o.id = s.org_id and o.domain = 'acme.ng';
set role authenticated;
select test.as_user('00000000-0000-0000-0000-00000000000c', 'kemi@acme.ng');
select test.blocked($$select check_in('in', 6.6018, 3.3515, 10)$$, 'subscription has expired', 'Check-in stops when the trial has ended');

