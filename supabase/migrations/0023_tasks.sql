-- 0023 · Task management
--
--  * Tasks: title, details, due date, priority, labels, one or more assignees, status
--    (To do, In progress, In review, Done, Cancelled), comments and a full activity history.
--  * Who can assign: admins to anyone; managers to the people they line-manage and themselves;
--    everyone else to themselves (personal tasks).
--  * Who sees a task: its creator, its assignees, admins, and the line managers of its assignees.
--  * Review step: when someone else's task is marked done it goes to "In review"; the creator, their
--    line manager or an admin approves it (Done) or sends it back (In progress) with a note.
--  * Pro, Premium and trial add: projects, checklists, files, recurring tasks, the review step,
--    "Request update", due and overdue reminder emails, and reports. Basic keeps simple tasks.

create table if not exists public.task_projects (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations on delete cascade,
  name        text not null check (char_length(name) between 2 and 80),
  description text check (description is null or char_length(description) <= 500),
  color       text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  archived    boolean not null default false,
  created_by  uuid references public.members on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists task_projects_name_idx on public.task_projects (org_id, lower(name));

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations on delete cascade,
  project_id    uuid references public.task_projects on delete set null,
  title         text not null check (char_length(trim(title)) between 1 and 200),
  description   text check (description is null or char_length(description) <= 5000),
  status        text not null default 'todo' check (status in ('todo','in_progress','in_review','done','cancelled')),
  priority      text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_date      date,
  labels        text[] not null default '{}' check (cardinality(labels) <= 10),
  needs_review  boolean not null default false,
  recurrence    text check (recurrence is null or recurrence in ('daily','weekdays','weekly','monthly')),
  repeat_of     uuid references public.tasks on delete set null,
  created_by    uuid references public.members on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz,
  reviewed_by   uuid references public.members on delete set null,
  reminded_on   date
);
create index if not exists tasks_org_idx on public.tasks (org_id, status, due_date);

create table if not exists public.task_assignees (
  task_id   uuid not null references public.tasks on delete cascade,
  member_id uuid not null references public.members on delete cascade,
  org_id    uuid not null references public.organizations on delete cascade,
  primary key (task_id, member_id)
);
create index if not exists task_assignees_member_idx on public.task_assignees (member_id);

create table if not exists public.task_checklist (
  id        uuid primary key default gen_random_uuid(),
  task_id   uuid not null references public.tasks on delete cascade,
  org_id    uuid not null references public.organizations on delete cascade,
  text      text not null check (char_length(trim(text)) between 1 and 200),
  done      boolean not null default false,
  position  integer not null default 0,
  done_by   uuid references public.members on delete set null,
  done_at   timestamptz
);

create table if not exists public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks on delete cascade,
  org_id     uuid not null references public.organizations on delete cascade,
  member_id  uuid references public.members on delete set null,
  kind       text not null default 'comment' check (kind in ('comment','update_request','review')),
  body       text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.task_activity (
  id        bigint generated always as identity primary key,
  task_id   uuid not null references public.tasks on delete cascade,
  org_id    uuid not null references public.organizations on delete cascade,
  member_id uuid references public.members on delete set null,
  action    text not null,
  detail    text check (detail is null or char_length(detail) <= 300),
  at        timestamptz not null default now()
);

create table if not exists public.task_files (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks on delete cascade,
  org_id      uuid not null references public.organizations on delete cascade,
  path        text not null check (char_length(path) <= 300),
  name        text not null check (char_length(name) between 1 and 160),
  size        integer not null check (size between 1 and 10485760),
  uploaded_by uuid references public.members on delete set null,
  created_at  timestamptz not null default now()
);

-- ── who sees and who edits
create or replace function public.can_see_task(p_task uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (
    select 1 from public.tasks t
     where t.id = p_task and t.org_id = public.my_org_id()
       and (public.is_org_admin() or t.created_by = public.my_member_id()
            or exists (select 1 from public.task_assignees a where a.task_id = t.id and a.member_id = public.my_member_id())
            or exists (select 1 from public.task_assignees a join public.members m on m.id = a.member_id
                        where a.task_id = t.id and m.line_manager_id = public.my_member_id())))
$$;
revoke all on function public.can_see_task(uuid) from public, anon;
grant execute on function public.can_see_task(uuid) to authenticated;

-- Can change the task itself (title, assignees, dates, review): creator, admins, line managers of an assignee.
create or replace function public.can_manage_task(p_task uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (
    select 1 from public.tasks t
     where t.id = p_task and t.org_id = public.my_org_id()
       and (public.is_org_admin() or t.created_by = public.my_member_id()
            or exists (select 1 from public.task_assignees a join public.members m on m.id = a.member_id
                        where a.task_id = t.id and m.line_manager_id = public.my_member_id())))
$$;
revoke all on function public.can_manage_task(uuid) from public, anon;
grant execute on function public.can_manage_task(uuid) to authenticated;

-- May the signed-in person assign work to this colleague?
create or replace function public.can_assign_to(p_member uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select p_member = public.my_member_id()
      or exists (select 1 from public.members m where m.id = p_member and m.org_id = public.my_org_id() and m.status = 'active'
                   and (public.is_org_admin() or m.line_manager_id = public.my_member_id()))
$$;
revoke all on function public.can_assign_to(uuid) from public, anon;
grant execute on function public.can_assign_to(uuid) to authenticated;

alter table public.task_projects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_checklist enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_activity enable row level security;
alter table public.task_files enable row level security;
drop policy if exists task_projects_read on public.task_projects;
create policy task_projects_read on public.task_projects for select using (org_id = public.my_org_id());
drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select using (org_id = public.my_org_id() and public.can_see_task(id));
drop policy if exists task_assignees_read on public.task_assignees;
create policy task_assignees_read on public.task_assignees for select using (org_id = public.my_org_id() and public.can_see_task(task_id));
drop policy if exists task_checklist_read on public.task_checklist;
create policy task_checklist_read on public.task_checklist for select using (org_id = public.my_org_id() and public.can_see_task(task_id));
drop policy if exists task_comments_read on public.task_comments;
create policy task_comments_read on public.task_comments for select using (org_id = public.my_org_id() and public.can_see_task(task_id));
drop policy if exists task_activity_read on public.task_activity;
create policy task_activity_read on public.task_activity for select using (org_id = public.my_org_id() and public.can_see_task(task_id));
drop policy if exists task_files_read on public.task_files;
create policy task_files_read on public.task_files for select using (org_id = public.my_org_id() and public.can_see_task(task_id));
do $$
declare t text;
begin
  foreach t in array array['task_projects','tasks','task_assignees','task_checklist','task_comments','task_activity','task_files'] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

create or replace function public.task_log(p_task uuid, p_action text, p_detail text default null)
returns void language sql security definer set search_path = pg_catalog, public, pg_temp as $$
  insert into public.task_activity (task_id, org_id, member_id, action, detail)
  select p_task, t.org_id, public.my_member_id(), p_action, left(p_detail, 300) from public.tasks t where t.id = p_task
$$;
revoke all on function public.task_log(uuid, text, text) from public, anon, authenticated;

create or replace function public.clean_labels(p_labels text[])
returns text[] language sql immutable set search_path = pg_catalog, public, pg_temp as $$
  select coalesce(array(select distinct lower(left(trim(l), 30)) from unnest(coalesce(p_labels, '{}')) l where trim(l) <> '' limit 10), '{}')
$$;

-- ── create and change
-- p: {title, description, project_id, assignees: [uuid], due_date, priority, labels: [text], needs_review, recurrence, checklist: [text]}
create or replace function public.create_task(p jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_me uuid := public.my_member_id(); v_pro boolean; v_id uuid; v_m uuid; v_item text; v_pos int := 0;
        v_assignees uuid[];
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  perform public.rate_limit_hit('task_create', 'm:' || v_me, 200, interval '1 hour');
  v_pro := public.org_has_pro(v_org);
  v_assignees := coalesce(array(select distinct (x)::uuid from jsonb_array_elements_text(coalesce(p -> 'assignees', '[]'::jsonb)) x), '{}');
  if cardinality(v_assignees) = 0 then v_assignees := array[v_me]; end if;
  if cardinality(v_assignees) > 20 then raise exception 'A task can have up to 20 people.'; end if;
  foreach v_m in array v_assignees loop
    if not public.can_assign_to(v_m) then raise exception 'You can only give tasks to yourself or to people you manage.'; end if;
  end loop;
  if not v_pro and (nullif(p ->> 'project_id', '') is not null or nullif(p ->> 'recurrence', '') is not null
                    or jsonb_array_length(coalesce(p -> 'checklist', '[]'::jsonb)) > 0 or coalesce((p ->> 'needs_review')::boolean, false)) then
    raise exception 'Projects, checklists, recurring tasks and reviews are part of Pro and Premium.'; end if;
  if nullif(p ->> 'project_id', '') is not null and not exists (select 1 from public.task_projects where id = (p ->> 'project_id')::uuid and org_id = v_org and not archived) then
    raise exception 'Choose a project.'; end if;
  insert into public.tasks (org_id, project_id, title, description, priority, due_date, labels, needs_review, recurrence, created_by)
  values (v_org, nullif(p ->> 'project_id', '')::uuid, trim(p ->> 'title'), nullif(trim(coalesce(p ->> 'description', '')), ''),
          coalesce(nullif(p ->> 'priority', ''), 'normal'), nullif(p ->> 'due_date', '')::date,
          public.clean_labels(array(select jsonb_array_elements_text(coalesce(p -> 'labels', '[]'::jsonb)))),
          coalesce((p ->> 'needs_review')::boolean, false) and not (v_assignees = array[v_me]),
          case when nullif(p ->> 'due_date', '') is not null then nullif(p ->> 'recurrence', '') end, v_me)
  returning id into v_id;
  insert into public.task_assignees (task_id, member_id, org_id) select v_id, a, v_org from unnest(v_assignees) a;
  for v_item in select trim(x) from jsonb_array_elements_text(coalesce(p -> 'checklist', '[]'::jsonb)) x where trim(x) <> '' limit 50 loop
    insert into public.task_checklist (task_id, org_id, text, position) values (v_id, v_org, left(v_item, 200), v_pos); v_pos := v_pos + 1;
  end loop;
  perform public.task_log(v_id, 'created');
  return v_id;
end $$;
revoke all on function public.create_task(jsonb) from public, anon;
grant execute on function public.create_task(jsonb) to authenticated;

-- Change fields (only the keys sent). Assignees replace the current list.
create or replace function public.update_task(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare t public.tasks%rowtype; v_m uuid; v_new uuid[]; v_pro boolean;
begin
  select * into t from public.tasks where id = p_id and org_id = public.my_org_id() for update;
  if not found or not public.can_manage_task(p_id) then raise exception 'Only the person who created this task, their manager or an admin can change it.'; end if;
  v_pro := public.org_has_pro(t.org_id);
  if not v_pro and (nullif(p ->> 'project_id', '') is not null or nullif(p ->> 'recurrence', '') is not null or coalesce((p ->> 'needs_review')::boolean, false)) then
    raise exception 'Projects, recurring tasks and reviews are part of Pro and Premium.'; end if;
  if p ? 'title' and char_length(trim(coalesce(p ->> 'title', ''))) not between 1 and 200 then raise exception 'Give the task a title.'; end if;
  if p ? 'project_id' and nullif(p ->> 'project_id', '') is not null
     and not exists (select 1 from public.task_projects where id = (p ->> 'project_id')::uuid and org_id = t.org_id) then raise exception 'Choose a project.'; end if;
  update public.tasks set
    title = case when p ? 'title' then trim(p ->> 'title') else title end,
    description = case when p ? 'description' then nullif(trim(coalesce(p ->> 'description', '')), '') else description end,
    project_id = case when p ? 'project_id' then nullif(p ->> 'project_id', '')::uuid else project_id end,
    priority = case when p ? 'priority' then coalesce(nullif(p ->> 'priority', ''), 'normal') else priority end,
    due_date = case when p ? 'due_date' then nullif(p ->> 'due_date', '')::date else due_date end,
    labels = case when p ? 'labels' then public.clean_labels(array(select jsonb_array_elements_text(p -> 'labels'))) else labels end,
    needs_review = case when p ? 'needs_review' then coalesce((p ->> 'needs_review')::boolean, false) else needs_review end,
    recurrence = case when p ? 'recurrence' then nullif(p ->> 'recurrence', '') else recurrence end,
    reminded_on = case when p ? 'due_date' then null else reminded_on end,
    updated_at = now()
   where id = p_id;
  if p ? 'assignees' then
    v_new := coalesce(array(select distinct (x)::uuid from jsonb_array_elements_text(p -> 'assignees') x), '{}');
    if cardinality(v_new) = 0 or cardinality(v_new) > 20 then raise exception 'A task needs 1 to 20 people.'; end if;
    foreach v_m in array v_new loop
      if not exists (select 1 from public.task_assignees where task_id = p_id and member_id = v_m) and not public.can_assign_to(v_m) then
        raise exception 'You can only give tasks to yourself or to people you manage.'; end if;
    end loop;
    delete from public.task_assignees where task_id = p_id and not (member_id = any(v_new));
    insert into public.task_assignees (task_id, member_id, org_id) select p_id, a, t.org_id from unnest(v_new) a on conflict do nothing;
  end if;
  perform public.task_log(p_id, 'edited', (select string_agg(k, ', ') from jsonb_object_keys(p) k));
end $$;
revoke all on function public.update_task(uuid, jsonb) from public, anon;
grant execute on function public.update_task(uuid, jsonb) to authenticated;

-- The next copy of a recurring task, created when one is completed.
create or replace function public.task_repeat(p_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare t public.tasks%rowtype; v_next date; v_id uuid;
begin
  select * into t from public.tasks where id = p_id;
  if t.recurrence is null or t.due_date is null then return null; end if;
  v_next := case t.recurrence
    when 'daily' then t.due_date + 1
    when 'weekdays' then t.due_date + case extract(isodow from t.due_date) when 5 then 3 when 6 then 2 else 1 end
    when 'weekly' then t.due_date + 7
    when 'monthly' then (t.due_date + interval '1 month')::date end;
  insert into public.tasks (org_id, project_id, title, description, priority, due_date, labels, needs_review, recurrence, repeat_of, created_by)
  values (t.org_id, t.project_id, t.title, t.description, t.priority, v_next, t.labels, t.needs_review, t.recurrence, coalesce(t.repeat_of, t.id), t.created_by)
  returning id into v_id;
  insert into public.task_assignees (task_id, member_id, org_id) select v_id, member_id, org_id from public.task_assignees where task_id = p_id;
  insert into public.task_checklist (task_id, org_id, text, position) select v_id, org_id, text, position from public.task_checklist where task_id = p_id;
  insert into public.task_activity (task_id, org_id, member_id, action, detail) values (v_id, t.org_id, null, 'created', 'repeats ' || t.recurrence);
  update public.tasks set recurrence = null where id = p_id;   -- only the newest copy repeats
  return v_id;
end $$;
revoke all on function public.task_repeat(uuid) from public, anon, authenticated;

-- Move a task along. Assignees: To do, In progress, Done (goes to In review when a review is needed).
-- Managers of the task: any status.
create or replace function public.set_task_status(p_id uuid, p_status text)
returns text language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare t public.tasks%rowtype; v_me uuid := public.my_member_id(); v_manage boolean; v_assignee boolean; v_to text := p_status;
begin
  select * into t from public.tasks where id = p_id and org_id = public.my_org_id() for update;
  if not found or not public.can_see_task(p_id) then raise exception 'That task was not found.'; end if;
  if p_status not in ('todo','in_progress','in_review','done','cancelled') then raise exception 'Unknown status.'; end if;
  v_manage := public.can_manage_task(p_id);
  v_assignee := exists (select 1 from public.task_assignees where task_id = p_id and member_id = v_me);
  if not v_manage and not v_assignee then raise exception 'Only the people on this task can change it.'; end if;
  if not v_manage and p_status = 'cancelled' then raise exception 'Only the person who created this task or a manager can cancel it.'; end if;
  -- Someone doing the work can't approve their own work.
  if p_status = 'done' and t.needs_review and public.org_has_pro(t.org_id)
     and not (v_manage and not v_assignee) and not (v_manage and t.created_by = v_me) then v_to := 'in_review'; end if;
  if v_to = t.status then return v_to; end if;
  update public.tasks set status = v_to, updated_at = now(),
         completed_at = case when v_to = 'done' then now() when v_to in ('todo','in_progress') then null else completed_at end,
         reviewed_by = case when v_to = 'done' and t.status = 'in_review' then v_me else reviewed_by end
   where id = p_id;
  perform public.task_log(p_id, 'status', v_to);
  if v_to = 'done' and t.recurrence is not null and public.org_has_pro(t.org_id) then perform public.task_repeat(p_id); end if;
  return v_to;
end $$;
revoke all on function public.set_task_status(uuid, text) from public, anon;
grant execute on function public.set_task_status(uuid, text) to authenticated;

-- Approve (Done) or send back (In progress) with a note.
create or replace function public.review_task(p_id uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare t public.tasks%rowtype;
begin
  select * into t from public.tasks where id = p_id and org_id = public.my_org_id() for update;
  if not found or not public.can_manage_task(p_id) then raise exception 'Only the person who created this task, their manager or an admin can review it.'; end if;
  if t.status <> 'in_review' then raise exception 'This task isn''t waiting for review.'; end if;
  if not p_approve and char_length(trim(coalesce(p_note, ''))) < 2 then raise exception 'Say what still needs doing.'; end if;
  update public.tasks set status = case when p_approve then 'done' else 'in_progress' end,
         completed_at = case when p_approve then now() else null end, reviewed_by = public.my_member_id(), updated_at = now()
   where id = p_id;
  if nullif(trim(coalesce(p_note, '')), '') is not null then
    insert into public.task_comments (task_id, org_id, member_id, kind, body) values (p_id, t.org_id, public.my_member_id(), 'review', left(trim(p_note), 2000));
  end if;
  perform public.task_log(p_id, case when p_approve then 'approved' else 'sent back' end);
  if p_approve and t.recurrence is not null then perform public.task_repeat(p_id); end if;
end $$;
revoke all on function public.review_task(uuid, boolean, text) from public, anon;
grant execute on function public.review_task(uuid, boolean, text) to authenticated;

create or replace function public.delete_task(p_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare t public.tasks%rowtype;
begin
  select * into t from public.tasks where id = p_id and org_id = public.my_org_id();
  if not found or not (public.is_org_admin() or coalesce(t.created_by = public.my_member_id(), false)) then raise exception 'Only the person who created this task or an admin can delete it.'; end if;
  delete from public.tasks where id = p_id;
end $$;
revoke all on function public.delete_task(uuid) from public, anon;
grant execute on function public.delete_task(uuid) to authenticated;

-- ── comments, update requests, checklist, files
create or replace function public.add_task_comment(p_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_id uuid;
begin
  if not public.can_see_task(p_id) then raise exception 'That task was not found.'; end if;
  perform public.rate_limit_hit('task_comment', 'm:' || public.my_member_id(), 200, interval '1 hour');
  insert into public.task_comments (task_id, org_id, member_id, body) values (p_id, public.my_org_id(), public.my_member_id(), left(trim(p_body), 2000))
  returning id into v_id;
  update public.tasks set updated_at = now() where id = p_id;
  return v_id;
end $$;
revoke all on function public.add_task_comment(uuid, text) from public, anon;
grant execute on function public.add_task_comment(uuid, text) to authenticated;

-- "Request update" (Pro): a note to the people on the task. The app emails them.
create or replace function public.request_task_update(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not public.can_manage_task(p_id) then raise exception 'Only the person who created this task, their manager or an admin can ask for an update.'; end if;
  if not public.org_has_pro(public.my_org_id()) then raise exception 'Request update is part of Pro and Premium.'; end if;
  perform public.rate_limit_hit('task_nudge', 't:' || p_id, 3, interval '1 day');
  insert into public.task_comments (task_id, org_id, member_id, kind, body)
  values (p_id, public.my_org_id(), public.my_member_id(), 'update_request', coalesce(nullif(left(trim(coalesce(p_note, '')), 2000), ''), 'Please give an update on this task.'));
  perform public.task_log(p_id, 'update requested');
end $$;
revoke all on function public.request_task_update(uuid, text) from public, anon;
grant execute on function public.request_task_update(uuid, text) to authenticated;

create or replace function public.add_check_item(p_id uuid, p_text text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_id uuid;
begin
  if not public.can_see_task(p_id) then raise exception 'That task was not found.'; end if;
  if not public.org_has_pro(public.my_org_id()) then raise exception 'Checklists are part of Pro and Premium.'; end if;
  if (select count(*) from public.task_checklist where task_id = p_id) >= 50 then raise exception 'A checklist can have up to 50 steps.'; end if;
  insert into public.task_checklist (task_id, org_id, text, position)
  values (p_id, public.my_org_id(), left(trim(p_text), 200), coalesce((select max(position) + 1 from public.task_checklist where task_id = p_id), 0))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.add_check_item(uuid, text) from public, anon;
grant execute on function public.add_check_item(uuid, text) to authenticated;

create or replace function public.toggle_check_item(p_item uuid, p_done boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_task uuid;
begin
  select task_id into v_task from public.task_checklist where id = p_item and org_id = public.my_org_id();
  if v_task is null or not public.can_see_task(v_task) then raise exception 'That step was not found.'; end if;
  update public.task_checklist set done = coalesce(p_done, false), done_by = case when p_done then public.my_member_id() end,
         done_at = case when p_done then now() end where id = p_item;
  update public.tasks set updated_at = now() where id = v_task;
end $$;
revoke all on function public.toggle_check_item(uuid, boolean) from public, anon;
grant execute on function public.toggle_check_item(uuid, boolean) to authenticated;

create or replace function public.remove_check_item(p_item uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_task uuid;
begin
  select task_id into v_task from public.task_checklist where id = p_item and org_id = public.my_org_id();
  if v_task is null or not public.can_manage_task(v_task) then raise exception 'Only the person who created this task or a manager can remove steps.'; end if;
  delete from public.task_checklist where id = p_item;
end $$;
revoke all on function public.remove_check_item(uuid) from public, anon;
grant execute on function public.remove_check_item(uuid) to authenticated;

-- Files are uploaded by the server to private storage; this records them (path must be this task's folder).
create or replace function public.attach_task_file(p_id uuid, p_path text, p_name text, p_size integer)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_id uuid;
begin
  if not public.can_see_task(p_id) then raise exception 'That task was not found.'; end if;
  if not public.org_has_pro(public.my_org_id()) then raise exception 'Files on tasks are part of Pro and Premium.'; end if;
  if position((public.my_org_id()::text || '/' || p_id::text || '/') in p_path) <> 1 then raise exception 'That file isn''t for this task.'; end if;
  if (select count(*) from public.task_files where task_id = p_id) >= 20 then raise exception 'A task can have up to 20 files.'; end if;
  insert into public.task_files (task_id, org_id, path, name, size, uploaded_by)
  values (p_id, public.my_org_id(), p_path, left(p_name, 160), p_size, public.my_member_id()) returning id into v_id;
  perform public.task_log(p_id, 'file added', left(p_name, 160));
  return v_id;
end $$;
revoke all on function public.attach_task_file(uuid, text, text, integer) from public, anon;
grant execute on function public.attach_task_file(uuid, text, text, integer) to authenticated;

create or replace function public.remove_task_file(p_file uuid)
returns text language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare f public.task_files%rowtype;
begin
  select * into f from public.task_files where id = p_file and org_id = public.my_org_id();
  if not found or not (public.can_manage_task(f.task_id) or coalesce(f.uploaded_by = public.my_member_id(), false)) then raise exception 'You can''t remove this file.'; end if;
  delete from public.task_files where id = p_file;
  perform public.task_log(f.task_id, 'file removed', f.name);
  return f.path;
end $$;
revoke all on function public.remove_task_file(uuid) from public, anon;
grant execute on function public.remove_task_file(uuid) to authenticated;

-- ── projects (Pro): admins and managers
create or replace function public.save_task_project(p_id uuid, p_name text, p_description text, p_color text, p_archived boolean)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_id uuid;
begin
  if not public.is_org_viewer() then raise exception 'Only managers and admins can manage projects.'; end if;
  if not public.org_has_pro(v_org) then raise exception 'Projects are part of Pro and Premium.'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 80 then raise exception 'Give the project a name (2 to 80 characters).'; end if;
  if p_id is null then
    insert into public.task_projects (org_id, name, description, color, created_by)
    values (v_org, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), p_color, public.my_member_id()) returning id into v_id;
  else
    update public.task_projects set name = trim(p_name), description = nullif(trim(coalesce(p_description, '')), ''), color = p_color,
           archived = coalesce(p_archived, false) where id = p_id and org_id = v_org returning id into v_id;
    if v_id is null then raise exception 'That project was not found.'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'You already have a project with that name.';
end $$;
revoke all on function public.save_task_project(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.save_task_project(uuid, text, text, text, boolean) to authenticated;

-- ── reports (Pro): per person over a period, for managers (their team) and admins (everyone)
create or replace function public.task_report(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_today date;
begin
  if not public.is_org_viewer() then raise exception 'Only managers and admins can see task reports.'; end if;
  if not public.org_has_pro(v_org) then raise exception 'Task reports are part of Pro and Premium.'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'Choose a period of up to one year.'; end if;
  v_today := (now() at time zone (select timezone from public.organizations where id = v_org))::date;
  return coalesce((select jsonb_agg(r order by r ->> 'name') from (
    select jsonb_build_object('member_id', m.id, 'name', coalesce(m.full_name, m.email), 'team', m.team,
      'assigned', count(t.id) filter (where t.created_at::date between p_from and p_to),
      'done', count(t.id) filter (where t.status = 'done' and t.completed_at::date between p_from and p_to),
      'on_time', count(t.id) filter (where t.status = 'done' and t.completed_at::date between p_from and p_to
                                     and (t.due_date is null or t.completed_at::date <= t.due_date)),
      'overdue_now', count(t.id) filter (where t.status in ('todo','in_progress','in_review') and t.due_date < v_today),
      'open_now', count(t.id) filter (where t.status in ('todo','in_progress','in_review')),
      'avg_days', round(avg(extract(epoch from t.completed_at - t.created_at) / 86400) filter (where t.status = 'done' and t.completed_at::date between p_from and p_to)::numeric, 1)) as r
      from public.members m
      left join public.task_assignees a on a.member_id = m.id
      left join public.tasks t on t.id = a.task_id
     where m.org_id = v_org and m.status = 'active' and (public.is_org_admin() or m.line_manager_id = public.my_member_id() or m.id = public.my_member_id())
     group by m.id, m.full_name, m.email, m.team) x), '[]'::jsonb);
end $$;
revoke all on function public.task_report(date, date) from public, anon;
grant execute on function public.task_report(date, date) to authenticated;

-- ── reminders (Pro): once a day after 08:00, tasks due tomorrow and tasks that became overdue.
create or replace function public.claim_task_reminders()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_out jsonb := '[]'::jsonb; r record;
begin
  for r in
    select t.id, t.title, t.due_date, t.org_id, o.name as org, o.logo_url, o.accent_color, o.timezone,
           case when t.due_date < (now() at time zone o.timezone)::date then 'overdue' else 'due_tomorrow' end as kind
      from public.tasks t join public.organizations o on o.id = t.org_id
     where t.status in ('todo','in_progress') and t.due_date is not null and o.suspended_at is null
       and (now() at time zone o.timezone)::time >= time '08:00'
       and (t.reminded_on is null or t.reminded_on < (now() at time zone o.timezone)::date)
       and (t.due_date = (now() at time zone o.timezone)::date + 1
            or (t.due_date < (now() at time zone o.timezone)::date and (t.reminded_on is null or t.reminded_on <= t.due_date)))
       and public.org_has_pro(t.org_id)
     limit 500
  loop
    update public.tasks set reminded_on = (now() at time zone r.timezone)::date where id = r.id;
    v_out := v_out || jsonb_build_object('task_id', r.id, 'title', r.title, 'due_date', r.due_date, 'kind', r.kind,
      'org', r.org, 'logo_url', r.logo_url, 'accent', r.accent_color,
      'to', coalesce((select jsonb_agg(m.email) from public.task_assignees a join public.members m on m.id = a.member_id
                       where a.task_id = r.id and m.status = 'active'), '[]'::jsonb));
  end loop;
  return v_out;
end $$;
revoke all on function public.claim_task_reminders() from public, anon, authenticated;
grant execute on function public.claim_task_reminders() to service_role;

update public.platform_plans set features = array_append(features, 'Tasks: assign, due dates, priorities, comments'), updated_at = now()
 where plan = 'basic' and not features @> array['Tasks: assign, due dates, priorities, comments'];
update public.platform_plans set features = array_append(features, 'Full task management: projects, checklists, files, recurring tasks, reviews, reminders and reports'), updated_at = now()
 where plan = 'pro' and not features @> array['Full task management: projects, checklists, files, recurring tasks, reviews, reminders and reports'];

-- Fix (0021): deciding leave must refuse when the person has no line manager and the caller isn't an admin.
-- A null comparison let the check pass.
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

-- Company links can't clash with module pages (/tasks, /visitors, /kiosk and others).
create or replace function public.reserved_slugs()
returns text[] language sql immutable as $$
  select array['app','admin','console','login','start','onboarding','pending','api','auth','preview','support',
               'help','pricing','about','terms','privacy','static','assets','www','mail','billing','dashboard',
               'manifest','icon','sw','offline','5ime','fivetime','koraforge',
               -- added: pages and files that exist or may exist at the top level
               'signup','sign-up','register','robots','robots.txt','sitemap','sitemap.xml','global-admin','global',
               'security','settings','account','logout','signout','invite','reset','forgot','contact','legal',
               'status','docs','blog','careers','error','not-found','favicon.ico','apple-touch-icon.png',
               'icon.svg','icon-192.png','icon-512.png','offline.html','sw.js','manifest.webmanifest',
               -- added in 0023: the module pages
               'tasks','visitors','visit','v','kiosk','leave','profile','cron','visit-qr']
$$;
do $$
declare o record;
begin
  for o in select id, slug from public.organizations where slug = any (public.reserved_slugs()) loop
    update public.organizations set slug = public.unique_org_slug(slug || '-team') where id = o.id;
  end loop;
end $$;
