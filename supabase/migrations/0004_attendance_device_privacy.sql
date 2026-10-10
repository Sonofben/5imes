-- 5ime: keep employees' IP address and device (user-agent) details away from managers.
-- Managers keep read access to attendance times, places and flags; only owners/admins can
-- read network/device details, through attendance_device_info(). Apply after 0003.
begin;

revoke select on public.attendance from anon, authenticated;
grant select (id, org_id, member_id, kind, at, local_date, accuracy_m, location_type,
              location_id, distance_m, expected_mode, flags)
  on public.attendance to authenticated;

create or replace function public.attendance_device_info(p_from date, p_to date)
returns table (attendance_id uuid, ip text, user_agent text)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if auth.uid() is null or not public.is_org_admin() then
    raise exception 'Only admins can view device and network details.';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Choose a valid date range of up to 400 days.';
  end if;
  return query
    select a.id, a.ip, a.user_agent
      from public.attendance a
     where a.org_id = public.my_org_id() and a.local_date between p_from and p_to
     order by a.at, a.id;
end $$;

revoke all on function public.attendance_device_info(date, date) from public, anon;

-- replace_schedule: treat a missing company id as "not your company" (was NULL-unsafe).
do $$
declare v_src text;
begin
  select pg_get_functiondef('public.replace_schedule(uuid,uuid,jsonb)'::regprocedure) into v_src;
  if position('p_org <> public.my_org_id()' in v_src) = 0 then
    raise exception 'replace_schedule changed upstream; review 0004 before applying.';
  end if;
  execute replace(v_src, 'p_org <> public.my_org_id()', 'p_org is distinct from public.my_org_id()');
end $$;
grant execute on function public.attendance_device_info(date, date) to authenticated;

commit;
