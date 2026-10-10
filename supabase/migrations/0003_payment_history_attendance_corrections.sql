-- 5ime follow-up: auditable attendance corrections and read-only payment history support.
-- Apply after 0002_security_billing_attendance.sql.
begin;

-- A correction is an employee's request to fix one or both event times on one work date.
-- Attendance rows remain the operational source of truth; approved edits update them only
-- through the audited manager RPC below. GPS coordinates remain in the private location table.
create table public.attendance_correction_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  member_id uuid not null,
  work_date date not null,
  requested_in_at timestamptz,
  requested_out_at timestamptz,
  target_in_event_id uuid,
  target_out_event_id uuid,
  reason text not null check (length(trim(reason)) between 10 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_note text,
  constraint attendance_correction_request_org_id_key unique (id, org_id),
  constraint attendance_correction_request_org_member_fk
    foreign key (org_id, member_id) references public.members (org_id, id) on delete cascade,
  constraint attendance_correction_request_in_event_fk
    foreign key (target_in_event_id, org_id, member_id)
    references public.attendance (id, org_id, member_id) on delete set null (target_in_event_id),
  constraint attendance_correction_request_out_event_fk
    foreign key (target_out_event_id, org_id, member_id)
    references public.attendance (id, org_id, member_id) on delete set null (target_out_event_id),
  constraint attendance_correction_request_some_time_ck
    check (requested_in_at is not null or requested_out_at is not null),
  constraint attendance_correction_request_distinct_events_ck
    check (target_in_event_id is null or target_out_event_id is null or target_in_event_id <> target_out_event_id),
  constraint attendance_correction_request_review_state_ck
    check ((status = 'pending' and reviewed_at is null and reviewed_by is null)
      or (status in ('approved','rejected') and reviewed_at is not null and reviewed_by is not null))
);
create index attendance_correction_org_status_idx
  on public.attendance_correction_requests (org_id, status, submitted_at desc);
create index attendance_correction_member_idx
  on public.attendance_correction_requests (member_id, submitted_at desc);
create unique index attendance_correction_one_pending_per_day_idx
  on public.attendance_correction_requests (member_id, work_date) where status = 'pending';

create table public.attendance_correction_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  org_id uuid not null,
  actor_member_id uuid,
  actor_label text not null,
  event_type text not null check (event_type in ('submitted','approved','rejected')),
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  constraint attendance_correction_audit_request_fk
    foreign key (request_id, org_id)
    references public.attendance_correction_requests (id, org_id) on delete cascade
);
create index attendance_correction_audit_request_idx
  on public.attendance_correction_audit (request_id, occurred_at, id);

alter table public.attendance_correction_requests enable row level security;
alter table public.attendance_correction_audit enable row level security;
revoke all on public.attendance_correction_requests from public, anon, authenticated;
revoke all on public.attendance_correction_audit from public, anon, authenticated;
grant select on public.attendance_correction_requests to authenticated;
grant select on public.attendance_correction_audit to authenticated;
create policy attendance_correction_request_read on public.attendance_correction_requests
  for select to authenticated using (
    member_id in (select m.id from public.members m where m.user_id = auth.uid() and m.status = 'active')
    or (org_id = public.my_org_id() and public.is_org_viewer())
  );
create policy attendance_correction_audit_read on public.attendance_correction_audit
  for select to authenticated using (
    exists (
      select 1 from public.attendance_correction_requests r
      where r.id = attendance_correction_audit.request_id
        and (r.member_id in (select m.id from public.members m where m.user_id = auth.uid() and m.status = 'active')
          or (r.org_id = public.my_org_id() and public.is_org_viewer()))
    )
  );

create or replace function public.request_attendance_correction(
  p_work_date date, p_check_in time, p_check_out time, p_reason text
)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  v_member public.members%rowtype;
  v_org public.organizations%rowtype;
  v_request_id uuid;
  v_in_at timestamptz;
  v_out_at timestamptz;
  v_out_local timestamp;
  v_in_id uuid;
  v_out_id uuid;
  v_before_in jsonb;
  v_before_out jsonb;
  v_now_local timestamp;
begin
  select * into v_member from public.members
   where user_id = auth.uid() and status = 'active';
  if not found then raise exception 'Your account is not active yet.'; end if;
  select * into v_org from public.organizations where id = v_member.org_id;
  if p_work_date is null or p_work_date > (clock_timestamp() at time zone v_org.timezone)::date then
    raise exception 'Choose a work date that is today or earlier.';
  end if;
  if p_check_in is null and p_check_out is null then
    raise exception 'Enter a corrected check-in time, check-out time, or both.';
  end if;
  if length(trim(coalesce(p_reason, ''))) not between 10 and 1000 then
    raise exception 'Explain the correction in 10 to 1,000 characters.';
  end if;

  if p_check_in is not null then
    v_in_at := (p_work_date + p_check_in) at time zone v_org.timezone;
  end if;
  if p_check_out is not null then
    v_out_local := p_work_date + p_check_out;
    if p_check_in is not null and p_check_out < p_check_in then
      v_out_local := v_out_local + interval '1 day';
    end if;
    v_out_at := v_out_local at time zone v_org.timezone;
  end if;
  if v_in_at is not null and v_out_at is not null and v_out_at <= v_in_at then
    raise exception 'The corrected check-out must be after the corrected check-in.';
  end if;
  if coalesce(v_in_at, v_out_at) > clock_timestamp() then
    raise exception 'Corrected times cannot be in the future.';
  end if;
  if v_in_at is not null and v_out_at is not null and v_out_at > clock_timestamp() then
    raise exception 'Corrected times cannot be in the future.';
  end if;

  select a.id into v_in_id from public.attendance a
   where a.org_id = v_member.org_id and a.member_id = v_member.id
     and a.kind = 'in' and a.local_date = p_work_date
   order by a.at asc limit 1;
  if v_in_id is not null then
    select a.id into v_out_id from public.attendance a
     where a.org_id = v_member.org_id and a.member_id = v_member.id
       and a.kind = 'out' and a.local_date = p_work_date
       and a.at > (select i.at from public.attendance i where i.id = v_in_id)
     order by a.at desc limit 1;
    if v_out_id is null then
      select a.id into v_out_id from public.attendance a
       where a.org_id = v_member.org_id and a.member_id = v_member.id
         and a.kind = 'out' and a.local_date = p_work_date + 1
         and a.at > (select i.at from public.attendance i where i.id = v_in_id)
       order by a.at asc limit 1;
    end if;
  else
    select a.id into v_out_id from public.attendance a
     where a.org_id = v_member.org_id and a.member_id = v_member.id
       and a.kind = 'out' and a.local_date = p_work_date
     order by a.at desc limit 1;
  end if;

  if v_in_id is not null then
    select jsonb_build_object('id', a.id, 'at', a.at, 'local_date', a.local_date,
      'kind', a.kind, 'flags', a.flags, 'location_type', a.location_type)
      into v_before_in from public.attendance a where a.id = v_in_id;
  end if;
  if v_out_id is not null then
    select jsonb_build_object('id', a.id, 'at', a.at, 'local_date', a.local_date,
      'kind', a.kind, 'flags', a.flags, 'location_type', a.location_type)
      into v_before_out from public.attendance a where a.id = v_out_id;
  end if;

  v_now_local := clock_timestamp() at time zone v_org.timezone;
  insert into public.attendance_correction_requests (
    org_id, member_id, work_date, requested_in_at, requested_out_at,
    target_in_event_id, target_out_event_id, reason
  ) values (
    v_member.org_id, v_member.id, p_work_date, v_in_at, v_out_at,
    v_in_id, v_out_id, trim(p_reason)
  ) returning id into v_request_id;

  insert into public.attendance_correction_audit (
    request_id, org_id, actor_member_id, actor_label, event_type, details
  ) values (
    v_request_id, v_member.org_id, v_member.id, coalesce(v_member.full_name, v_member.email), 'submitted',
    jsonb_build_object(
      'work_date', p_work_date,
      'requested_in_at', v_in_at,
      'requested_out_at', v_out_at,
      'reason', trim(p_reason),
      'before', jsonb_build_object('in', v_before_in, 'out', v_before_out),
      'submitted_local_at', v_now_local
    )
  );
  return v_request_id;
exception when unique_violation then
  raise exception 'A correction for this work date is already waiting for review.';
end $$;

create or replace function public.review_attendance_correction(
  p_request_id uuid, p_approve boolean, p_note text default null
)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  v_actor public.members%rowtype;
  v_request public.attendance_correction_requests%rowtype;
  v_org public.organizations%rowtype;
  v_event public.attendance%rowtype;
  v_before_in jsonb;
  v_before_out jsonb;
  v_after_in jsonb;
  v_after_out jsonb;
  v_effective_in timestamptz;
  v_effective_out timestamptz;
  v_local timestamp;
  v_local_date date;
  v_weekday integer;
  v_mode text;
  v_flags text[];
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_result_status text;
begin
  select * into v_actor from public.members
   where user_id = auth.uid() and status = 'active' and org_id = public.my_org_id();
  if not found or not public.is_org_viewer() then
    raise exception 'Only an active manager or admin can review attendance corrections.';
  end if;
  if p_request_id is null or p_approve is null then raise exception 'Choose a correction request and decision.'; end if;
  if length(coalesce(v_note, '')) > 500 then raise exception 'Review notes must be 500 characters or fewer.'; end if;

  select * into v_request from public.attendance_correction_requests
   where id = p_request_id and org_id = v_actor.org_id for update;
  if not found then raise exception 'That correction request was not found.'; end if;
  if v_request.status <> 'pending' then raise exception 'This correction has already been reviewed.'; end if;
  if v_request.member_id = v_actor.id then raise exception 'You cannot approve or reject your own correction request.'; end if;
  select * into v_org from public.organizations where id = v_request.org_id;

  if p_approve then
    if v_request.target_in_event_id is not null then
      select * into v_event from public.attendance
       where id = v_request.target_in_event_id and org_id = v_request.org_id and member_id = v_request.member_id
       for update;
      if found then
        v_before_in := jsonb_build_object('id', v_event.id, 'at', v_event.at, 'local_date', v_event.local_date,
          'kind', v_event.kind, 'flags', v_event.flags, 'location_type', v_event.location_type);
        if v_request.requested_in_at is null then v_effective_in := v_event.at; else v_effective_in := v_request.requested_in_at; end if;
      end if;
    end if;
    if v_request.target_out_event_id is not null then
      select * into v_event from public.attendance
       where id = v_request.target_out_event_id and org_id = v_request.org_id and member_id = v_request.member_id
       for update;
      if found then
        v_before_out := jsonb_build_object('id', v_event.id, 'at', v_event.at, 'local_date', v_event.local_date,
          'kind', v_event.kind, 'flags', v_event.flags, 'location_type', v_event.location_type);
        if v_request.requested_out_at is null then v_effective_out := v_event.at; else v_effective_out := v_request.requested_out_at; end if;
      end if;
    end if;
    v_effective_in := coalesce(v_request.requested_in_at, v_effective_in);
    v_effective_out := coalesce(v_request.requested_out_at, v_effective_out);
    if v_effective_in is not null and v_effective_out is not null and v_effective_out <= v_effective_in then
      raise exception 'The corrected check-out must remain after the check-in.';
    end if;

    if v_request.requested_in_at is not null then
      v_local := v_request.requested_in_at at time zone v_org.timezone;
      v_local_date := v_local::date;
      if v_request.target_in_event_id is not null and exists (
        select 1 from public.attendance where id = v_request.target_in_event_id
          and org_id = v_request.org_id and member_id = v_request.member_id
      ) then
        select * into v_event from public.attendance where id = v_request.target_in_event_id for update;
        v_flags := array_remove(array_remove(coalesce(v_event.flags, '{}'::text[]), 'late'), 'corrected');
        if v_local::time > v_org.work_start + make_interval(mins => v_org.grace_minutes) then v_flags := array_append(v_flags, 'late'); end if;
        v_flags := array_append(v_flags, 'corrected');
        update public.attendance set at = v_request.requested_in_at, local_date = v_local_date, flags = v_flags
         where id = v_event.id;
      else
        v_weekday := extract(isodow from v_local)::integer;
        select coalesce(
          (select s.mode from public.schedules s where s.org_id = v_request.org_id and s.member_id = v_request.member_id and s.weekday = v_weekday),
          (select s.mode from public.schedules s where s.org_id = v_request.org_id and s.member_id is null and s.weekday = v_weekday),
          'office'
        ) into v_mode;
        v_flags := array['corrected']::text[];
        if v_local::time > v_org.work_start + make_interval(mins => v_org.grace_minutes) then v_flags := array_append(v_flags, 'late'); end if;
        insert into public.attendance (org_id, member_id, kind, at, local_date, location_type, expected_mode, flags)
        values (v_request.org_id, v_request.member_id, 'in', v_request.requested_in_at, v_local_date, 'none', v_mode, v_flags)
        returning * into v_event;
      end if;
      select jsonb_build_object('id', a.id, 'at', a.at, 'local_date', a.local_date,
        'kind', a.kind, 'flags', a.flags, 'location_type', a.location_type)
        into v_after_in from public.attendance a where a.id = coalesce(v_request.target_in_event_id, v_event.id);
      if v_after_in is null then
        select jsonb_build_object('id', a.id, 'at', a.at, 'local_date', a.local_date,
          'kind', a.kind, 'flags', a.flags, 'location_type', a.location_type)
          into v_after_in from public.attendance a where a.id = v_event.id;
      end if;
    end if;

    if v_request.requested_out_at is not null then
      v_local := v_request.requested_out_at at time zone v_org.timezone;
      v_local_date := v_local::date;
      if v_request.target_out_event_id is not null and exists (
        select 1 from public.attendance where id = v_request.target_out_event_id
          and org_id = v_request.org_id and member_id = v_request.member_id
      ) then
        select * into v_event from public.attendance where id = v_request.target_out_event_id for update;
        v_flags := array_remove(array_remove(coalesce(v_event.flags, '{}'::text[]), 'early_exit'), 'corrected');
        if v_local_date = v_request.work_date and v_local::time < v_org.work_end then v_flags := array_append(v_flags, 'early_exit'); end if;
        v_flags := array_append(v_flags, 'corrected');
        update public.attendance set at = v_request.requested_out_at, local_date = v_local_date, flags = v_flags
         where id = v_event.id;
      else
        v_weekday := extract(isodow from (v_request.work_date::timestamp))::integer;
        select coalesce(
          (select s.mode from public.schedules s where s.org_id = v_request.org_id and s.member_id = v_request.member_id and s.weekday = v_weekday),
          (select s.mode from public.schedules s where s.org_id = v_request.org_id and s.member_id is null and s.weekday = v_weekday),
          'office'
        ) into v_mode;
        v_flags := array['corrected']::text[];
        if v_local_date = v_request.work_date and v_local::time < v_org.work_end then v_flags := array_append(v_flags, 'early_exit'); end if;
        insert into public.attendance (org_id, member_id, kind, at, local_date, location_type, expected_mode, flags)
        values (v_request.org_id, v_request.member_id, 'out', v_request.requested_out_at, v_local_date, 'none', v_mode, v_flags)
        returning * into v_event;
      end if;
      select jsonb_build_object('id', a.id, 'at', a.at, 'local_date', a.local_date,
        'kind', a.kind, 'flags', a.flags, 'location_type', a.location_type)
        into v_after_out from public.attendance a where a.id = coalesce(v_request.target_out_event_id, v_event.id);
      if v_after_out is null then
        select jsonb_build_object('id', a.id, 'at', a.at, 'local_date', a.local_date,
          'kind', a.kind, 'flags', a.flags, 'location_type', a.location_type)
          into v_after_out from public.attendance a where a.id = v_event.id;
      end if;
    end if;
  end if;

  v_result_status := case when p_approve then 'approved' else 'rejected' end;
  update public.attendance_correction_requests set status = v_result_status,
    reviewed_at = clock_timestamp(), reviewed_by = v_actor.id, review_note = v_note
   where id = v_request.id;
  insert into public.attendance_correction_audit (
    request_id, org_id, actor_member_id, actor_label, event_type, details
  ) values (
    v_request.id, v_request.org_id, v_actor.id, coalesce(v_actor.full_name, v_actor.email), v_result_status,
    jsonb_build_object(
      'before', jsonb_build_object('in', v_before_in, 'out', v_before_out),
      'after', jsonb_build_object('in', v_after_in, 'out', v_after_out),
      'review_note', v_note
    )
  );
end $$;

-- Keep late-arrival flags aligned with the work window even when an overnight shift's
-- check-in occurs after midnight, and recalculate the flag when a correction changes time.
create or replace function public.normalize_attendance_late_flag()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  v_timezone text;
  v_work_start time;
  v_work_end time;
  v_grace integer;
  v_local_time time;
begin
  if new.kind <> 'in' then return new; end if;
  select o.timezone, o.work_start, o.work_end, o.grace_minutes
    into v_timezone, v_work_start, v_work_end, v_grace
    from public.organizations o where o.id = new.org_id;
  if not found then return new; end if;
  v_local_time := (new.at at time zone v_timezone)::time;
  new.flags := array_remove(coalesce(new.flags, '{}'::text[]), 'late');
  if (v_work_end <= v_work_start and v_local_time < v_work_end)
     or v_local_time > v_work_start + make_interval(mins => v_grace) then
    new.flags := array_append(new.flags, 'late');
  end if;
  return new;
end $$;
drop trigger if exists attendance_late_normalize on public.attendance;
create trigger attendance_late_normalize before insert or update of at, flags on public.attendance
  for each row execute function public.normalize_attendance_late_flag();

revoke all on function public.request_attendance_correction(date,time,time,text) from public, anon, authenticated;
revoke all on function public.review_attendance_correction(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.request_attendance_correction(date,time,time,text) to authenticated;
grant execute on function public.review_attendance_correction(uuid,boolean,text) to authenticated;

commit;
