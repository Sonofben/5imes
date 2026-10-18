-- 5ime: tenant-isolation sweep. Runs last, when every earlier test has left data from many
-- companies behind. For EVERY signed-in member of EVERY company, and for EVERY table and view
-- in the public schema, it checks that no row belonging to another company is visible.
-- A new table that forgets its row-level security policy fails here automatically.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
-- Who belongs where, computed with full access, for the checks to compare against.
create table test.member_org as
  select m.id as member_id, m.user_id, m.org_id, m.status, u.email
    from public.members m left join auth.users u on u.id = m.user_id;
grant select on test.member_org to authenticated, anon;
-- Global Admin staff legitimately see across companies through their console functions,
-- but not through the tables themselves; they are swept like everyone else.

create or replace function test.foreign_rows(p_user uuid, p_org uuid) returns table (rel text, n bigint)
language plpgsql as $$
declare
  r record;
  v_n bigint;
  v_sql text;
begin
  for r in
    select c.relname,
           bool_or(a.attname = 'org_id') as has_org,
           bool_or(a.attname = 'member_id') as has_member,
           bool_or(a.attname = 'user_id') as has_user,
           bool_or(a.attname = 'id') and c.relname = 'organizations' as is_orgs
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
     where n.nspname = 'public' and c.relkind in ('r', 'v')
     group by c.relname
  loop
    v_sql := null;
    if r.is_orgs then
      v_sql := format('select count(*) from public.organizations where id <> %L', p_org);
    elsif r.has_org then
      v_sql := format('select count(*) from public.%I where org_id is distinct from %L', r.relname, p_org);
    elsif r.has_member then
      v_sql := format('select count(*) from public.%I t where t.member_id in (select member_id from test.member_org where org_id <> %L)', r.relname, p_org);
    elsif r.has_user then
      v_sql := format('select count(*) from public.%I t where t.user_id is distinct from %L', r.relname, p_user);
    end if;
    continue when v_sql is null;   -- tables with no tenant column (prices, settings, counters) are covered by grants
    begin
      execute v_sql into v_n;
    exception when insufficient_privilege then
      v_n := 0;                     -- not readable at all: nothing leaks
    end;
    if v_n > 0 then rel := r.relname; n := v_n; return next; end if;
  end loop;
end $$;
grant execute on function test.foreign_rows(uuid, uuid) to authenticated, anon;

\echo '--- every member of every company sees only their own company'
set role authenticated;
do $$
declare m record; f record; v_checked int := 0;
begin
  for m in select user_id, org_id, email from test.member_org where status = 'active' and user_id is not null loop
    perform test.as_console(m.user_id::text, coalesce(m.email, 'x@x.ng'), 'aal2');
    for f in select * from test.foreign_rows(m.user_id, m.org_id) loop
      raise exception 'LEAK: % (%) can see % row(s) of another company in public.%', m.email, m.org_id, f.n, f.rel;
    end loop;
    v_checked := v_checked + 1;
  end loop;
  if v_checked < 5 then raise exception 'Sweep ran for only % members; expected the earlier tests to leave more.', v_checked; end if;
  raise notice 'checked % members', v_checked;
end $$;
select test.ok(true, 'No member can read another company''s rows in any table or view');

\echo '--- signed-out visitors read nothing'
reset role;
set role anon;
do $$
declare r record; v_n bigint;
begin
  perform set_config('test.uid', '', false);
  perform set_config('test.jwt', '{}', false);
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'v') loop
    begin
      execute format('select count(*) from public.%I', r.relname) into v_n;
    exception when insufficient_privilege then v_n := 0;
    end;
    if v_n > 0 then raise exception 'LEAK: signed-out visitors can read % row(s) of public.%', v_n, r.relname; end if;
  end loop;
end $$;
select test.ok(true, 'Signed-out visitors cannot read any table or view');
reset role;

\o
\echo '✅ TENANT SWEEP PASSED'
