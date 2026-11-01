-- 5ime: puts back the safe version of decide_leave (from 0023). Running 0021 again by hand had
-- restored an older version in which staff without a line manager could approve their own leave.
-- Safe to run more than once. Apply after 0030.
begin;
create or replace function public.decide_leave(p_id uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare r public.leave_requests%rowtype; v_me uuid := public.my_member_id(); v_lm uuid;
begin
  select * into r from public.leave_requests where id = p_id and org_id = public.my_org_id() for update;
  if not found then raise exception 'That leave request was not found.'; end if;
  if r.status <> 'pending' then raise exception 'This request has already been decided.'; end if;
  select line_manager_id into v_lm from public.members where id = r.member_id;
  if v_me is null or not (public.is_org_admin() or coalesce(r.approver_id = v_me, false) or coalesce(v_lm = v_me, false)) then
    raise exception 'Only their line manager or an admin can decide this.'; end if;
  if r.member_id = v_me and public.my_role() <> 'owner' then raise exception 'Someone else has to approve your own leave.'; end if;
  update public.leave_requests set status = case when p_approve then 'approved' else 'declined' end, decided_by = v_me, decided_at = now(),
         decision_note = nullif(left(trim(coalesce(p_note, '')), 500), '')
   where id = p_id;
end $$;
revoke all on function public.decide_leave(uuid, boolean, text) from public, anon;
grant execute on function public.decide_leave(uuid, boolean, text) to authenticated;
commit;
