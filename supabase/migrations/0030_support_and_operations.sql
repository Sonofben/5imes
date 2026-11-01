-- 5ime: support tickets between company admins and Global Admin, emails to company admins,
-- limit overrides for one company, a data protection request tracker, and a jobs and email
-- health log. Apply after 0029.
begin;

-- ───────────────────────────────────────────── support tickets
create table if not exists public.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  number          bigint generated always as identity unique,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  opened_by       uuid references public.members(id) on delete set null,
  subject         text not null check (length(trim(subject)) between 3 and 160),
  category        text not null default 'question' check (category in ('question','problem','billing','account','feature')),
  priority        text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status          text not null default 'open' check (status in ('open','waiting_on_customer','resolved','closed')),
  assigned_to     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_reply_by   text not null default 'customer' check (last_reply_by in ('customer','staff'))
);
create index if not exists support_tickets_org_idx on public.support_tickets (org_id, updated_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets (status, updated_at desc);

create table if not exists public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  author_user uuid references auth.users(id) on delete set null,
  author_name text not null,
  from_staff  boolean not null default false,
  internal    boolean not null default false check (not internal or from_staff),
  body        text not null check (length(trim(body)) between 1 and 8000),
  created_at  timestamptz not null default now()
);
create index if not exists support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_tickets, public.support_messages from public, anon, authenticated;
grant select on public.support_tickets, public.support_messages to authenticated;
drop policy if exists support_tickets_company_read on public.support_tickets;
create policy support_tickets_company_read on public.support_tickets for select to authenticated
  using (org_id = public.my_org_id() and public.is_org_admin());
drop policy if exists support_messages_company_read on public.support_messages;
create policy support_messages_company_read on public.support_messages for select to authenticated
  using (not internal and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.org_id = public.my_org_id() and public.is_org_admin()));

create or replace function public.open_support_ticket(p_subject text, p_category text, p_priority text, p_body text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_id uuid; v_name text;
begin
  if auth.uid() is null or v_org is null or not public.is_org_admin() then raise exception 'Only company admins can contact 5ime support.'; end if;
  perform public.rate_limit_hit('support_ticket', 'o:' || v_org, 20, interval '1 day');
  if p_priority = 'urgent' and p_category not in ('problem','account') then raise exception 'Urgent is for problems that stop your team working.'; end if;
  select coalesce(nullif(full_name, ''), email) into v_name from public.members where id = public.my_member_id();
  insert into public.support_tickets (org_id, opened_by, subject, category, priority)
  values (v_org, public.my_member_id(), trim(p_subject), coalesce(p_category, 'question'), coalesce(p_priority, 'normal'))
  returning id into v_id;
  insert into public.support_messages (ticket_id, author_user, author_name, body) values (v_id, auth.uid(), coalesce(v_name, 'Company admin'), trim(p_body));
  return v_id;
end $$;
revoke all on function public.open_support_ticket(text, text, text, text) from public, anon;
grant execute on function public.open_support_ticket(text, text, text, text) to authenticated;

create or replace function public.reply_support_ticket(p_ticket uuid, p_body text, p_close boolean default false)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare t public.support_tickets; v_name text;
begin
  select * into t from public.support_tickets where id = p_ticket for update;
  if not found or t.org_id is distinct from public.my_org_id() or not public.is_org_admin() then raise exception 'Ticket not found.'; end if;
  perform public.rate_limit_hit('support_reply', 'o:' || t.org_id, 200, interval '1 day');
  if length(trim(coalesce(p_body, ''))) > 0 then
    select coalesce(nullif(full_name, ''), email) into v_name from public.members where id = public.my_member_id();
    insert into public.support_messages (ticket_id, author_user, author_name, body) values (p_ticket, auth.uid(), coalesce(v_name, 'Company admin'), trim(p_body));
  elsif not coalesce(p_close, false) then raise exception 'Write a message.';
  end if;
  update public.support_tickets set
    status = case when p_close then 'closed' else 'open' end, last_reply_by = 'customer', updated_at = now()
   where id = p_ticket;
end $$;
revoke all on function public.reply_support_ticket(uuid, text, boolean) from public, anon;
grant execute on function public.reply_support_ticket(uuid, text, boolean) to authenticated;

create or replace function public.console_support_tickets(p_status text default null, p_org uuid default null)
returns table (id uuid, number bigint, org_id uuid, org_name text, subject text, category text, priority text, status text,
               assigned_email text, created_at timestamptz, updated_at timestamptz, last_reply_by text, opened_by_email text)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','finance','viewer']);
  return query
    select t.id, t.number, t.org_id, o.name, t.subject, t.category, t.priority, t.status,
           (select ps.email from public.platform_staff ps where ps.user_id = t.assigned_to), t.created_at, t.updated_at, t.last_reply_by,
           (select m.email from public.members m where m.id = t.opened_by)
      from public.support_tickets t join public.organizations o on o.id = t.org_id
     where (p_status is null or (p_status = 'active' and t.status in ('open','waiting_on_customer')) or t.status = p_status)
       and (p_org is null or t.org_id = p_org)
     order by case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
              case when t.last_reply_by = 'customer' and t.status = 'open' then 0 else 1 end, t.updated_at desc
     limit 500;
end $$;
revoke all on function public.console_support_tickets(text, uuid) from public, anon;
grant execute on function public.console_support_tickets(text, uuid) to authenticated;

create or replace function public.console_support_messages(p_ticket uuid)
returns setof public.support_messages language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','finance','viewer']);
  return query select * from public.support_messages where ticket_id = p_ticket order by created_at;
end $$;
revoke all on function public.console_support_messages(uuid) from public, anon;
grant execute on function public.console_support_messages(uuid) to authenticated;

-- Staff reply, internal note, status and assignment in one call. Returns the opener's email so the app can notify them.
create or replace function public.console_reply_ticket(p_ticket uuid, p_body text, p_internal boolean, p_status text, p_assign_me boolean default false)
returns text language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare t public.support_tickets; v_email text;
begin
  perform public.console_require(array['owner','support','finance']);
  select * into t from public.support_tickets where id = p_ticket for update;
  if not found then raise exception 'Ticket not found.'; end if;
  if p_status is not null and p_status not in ('open','waiting_on_customer','resolved','closed') then raise exception 'Choose a status.'; end if;
  if length(trim(coalesce(p_body, ''))) > 0 then
    select email into v_email from public.platform_staff where user_id = auth.uid();
    insert into public.support_messages (ticket_id, author_user, author_name, from_staff, internal, body)
    values (p_ticket, auth.uid(), '5ime support', true, coalesce(p_internal, false), trim(p_body));
  end if;
  update public.support_tickets set
    status = coalesce(p_status, case when length(trim(coalesce(p_body, ''))) > 0 and not coalesce(p_internal, false) then 'waiting_on_customer' else status end),
    last_reply_by = case when length(trim(coalesce(p_body, ''))) > 0 and not coalesce(p_internal, false) then 'staff' else last_reply_by end,
    assigned_to = case when p_assign_me then auth.uid() else assigned_to end,
    updated_at = now()
   where id = p_ticket;
  perform public.console_log(t.org_id, 'support.reply', null, jsonb_build_object('ticket', t.number, 'internal', p_internal, 'status', p_status));
  if length(trim(coalesce(p_body, ''))) > 0 and not coalesce(p_internal, false) then
    return (select m.email from public.members m where m.id = t.opened_by);
  end if;
  return null;
end $$;
revoke all on function public.console_reply_ticket(uuid, text, boolean, text, boolean) from public, anon;
grant execute on function public.console_reply_ticket(uuid, text, boolean, text, boolean) to authenticated;

-- ───────────────────────────────────────────── emails to company admins
create table if not exists public.admin_broadcasts (
  id          uuid primary key default gen_random_uuid(),
  subject     text not null check (length(trim(subject)) between 3 and 160),
  body        text not null check (length(trim(body)) between 10 and 10000),
  scope       text not null check (scope in ('all','plan','company')),
  plan        text check (plan is null or plan in ('trial','basic','pro','premium')),
  org_id      uuid references public.organizations(id) on delete set null,
  recipients  integer not null default 0,
  sent        integer not null default 0,
  failed      integer not null default 0,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.admin_broadcasts enable row level security;
revoke all on public.admin_broadcasts from public, anon, authenticated;

-- Who would receive a message: active owners and admins of active (not suspended or archived) companies.
create or replace function public.console_broadcast_recipients(p_scope text, p_plan text, p_org uuid)
returns table (email text, name text, org_name text)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support']);
  return query
    select distinct on (lower(m.email)) lower(m.email), coalesce(nullif(m.full_name, ''), m.email), o.name
      from public.members m join public.organizations o on o.id = m.org_id
     where m.status = 'active' and m.role in ('owner','admin') and o.suspended_at is null
       and (p_scope = 'all'
         or (p_scope = 'plan' and public.org_plan_now(o.id) = p_plan)
         or (p_scope = 'company' and o.id = p_org))
     order by lower(m.email);
end $$;
revoke all on function public.console_broadcast_recipients(text, text, uuid) from public, anon;
grant execute on function public.console_broadcast_recipients(text, text, uuid) to authenticated;

create or replace function public.console_start_broadcast(p_subject text, p_body text, p_scope text, p_plan text, p_org uuid, p_recipients integer, p_reason text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_id uuid;
begin
  perform public.console_require(array['owner','support'], p_reason, true);
  perform public.rate_limit_hit('broadcast', 'u:' || auth.uid(), 10, interval '1 day');
  if p_scope not in ('all','plan','company') then raise exception 'Choose who receives it.'; end if;
  if p_scope = 'plan' and p_plan not in ('trial','basic','pro','premium') then raise exception 'Choose a plan.'; end if;
  if p_scope = 'company' and p_org is null then raise exception 'Choose a company.'; end if;
  insert into public.admin_broadcasts (subject, body, scope, plan, org_id, recipients, created_by)
  values (trim(p_subject), trim(p_body), p_scope, case when p_scope = 'plan' then p_plan end, case when p_scope = 'company' then p_org end, p_recipients, auth.uid())
  returning id into v_id;
  perform public.console_log(case when p_scope = 'company' then p_org end, 'broadcast.send', p_reason,
    jsonb_build_object('broadcast', v_id, 'scope', p_scope, 'plan', p_plan, 'recipients', p_recipients));
  return v_id;
end $$;
revoke all on function public.console_start_broadcast(text, text, text, text, uuid, integer, text) from public, anon;
grant execute on function public.console_start_broadcast(text, text, text, text, uuid, integer, text) to authenticated;

create or replace function public.console_finish_broadcast(p_id uuid, p_sent integer, p_failed integer)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support']);
  update public.admin_broadcasts set sent = p_sent, failed = p_failed, finished_at = now() where id = p_id and created_by = auth.uid();
end $$;
revoke all on function public.console_finish_broadcast(uuid, integer, integer) from public, anon;
grant execute on function public.console_finish_broadcast(uuid, integer, integer) to authenticated;

create or replace function public.console_broadcasts()
returns table (id uuid, subject text, scope text, plan text, org_name text, recipients integer, sent integer, failed integer, created_at timestamptz, sender text)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','finance','viewer']);
  return query select b.id, b.subject, b.scope, b.plan, o.name, b.recipients, b.sent, b.failed, b.created_at,
                      (select ps.email from public.platform_staff ps where ps.user_id = b.created_by)
                 from public.admin_broadcasts b left join public.organizations o on o.id = b.org_id
                order by b.created_at desc limit 100;
end $$;
revoke all on function public.console_broadcasts() from public, anon;
grant execute on function public.console_broadcasts() to authenticated;

-- ───────────────────────────────────────────── limit overrides for one company
create table if not exists public.org_limit_overrides (
  org_id           uuid primary key references public.organizations(id) on delete cascade,
  max_staff        integer check (max_staff is null or max_staff between 0 and 1000000),
  max_offices      integer check (max_offices is null or max_offices between 0 and 1000),
  max_visits_month integer check (max_visits_month is null or max_visits_month between 0 and 1000000),
  ends_at          timestamptz,
  note             text check (note is null or length(note) <= 300),
  updated_by       uuid references auth.users(id) on delete set null,
  updated_at       timestamptz not null default now()
);
alter table public.org_limit_overrides enable row level security;
revoke all on public.org_limit_overrides from public, anon, authenticated;

-- A limit for this company: the override while it lasts (0 = no limit), otherwise the plan's own.
create or replace function public.org_limit(p_org uuid, p_plan text, p_key text)
returns integer language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare o public.org_limit_overrides; v integer;
begin
  select * into o from public.org_limit_overrides where org_id = p_org and (ends_at is null or ends_at > now());
  v := case p_key when 'staff' then o.max_staff when 'offices' then o.max_offices when 'visits' then o.max_visits_month end;
  if v is not null then return nullif(v, 0); end if;
  return case p_key
    when 'staff'   then (select max_seats from public.platform_plans where plan = p_plan)
    when 'offices' then (select max_locations from public.platform_plans where plan = p_plan)
    when 'visits'  then (select max_visitors_month from public.platform_plans where plan = p_plan) end;
end $$;
revoke all on function public.org_limit(uuid, text, text) from public, anon, authenticated;

do $$
declare f text; v_def text; v_new text; pairs text[][] := array[
  array['public.enforce_plan_staff_limit()', 'select max_seats into v_max from public.platform_plans where plan = v_plan;', 'v_max := public.org_limit(new.org_id, v_plan, ''staff'');'],
  array['public.enforce_plan_seat_purchase()', 'select max_seats into v_max from public.platform_plans where plan = new.plan;', 'v_max := public.org_limit(new.org_id, new.plan, ''staff'');'],
  array['public.enforce_location_plan()', 'select max_locations into v_max from public.platform_plans where plan = coalesce(v_plan, ''pro'');', 'v_max := public.org_limit(new.org_id, coalesce(v_plan, ''pro''), ''offices'');'],
  array['public.enforce_plan_visitor_limits()', 'select max_visitors_month into v_max from public.platform_plans where plan = ''pro'';', 'v_max := public.org_limit(new.org_id, ''pro'', ''visits'');'],
  array['public.my_plan_usage()', '''max_staff'', (select pp.max_seats from public.platform_plans pp where pp.plan = (select plan from p)),', '''max_staff'', public.org_limit((select id from o), (select plan from p), ''staff''),'],
  array['public.my_plan_usage()', '''max_visits_month'', (select pp.max_visitors_month from public.platform_plans pp where pp.plan = (select plan from p)))', '''max_visits_month'', public.org_limit((select id from o), (select plan from p), ''visits''))']];
  i int;
begin
  for i in 1 .. array_length(pairs, 1) loop
    f := pairs[i][1];
    v_def := pg_get_functiondef(f::regprocedure);
    v_new := replace(v_def, pairs[i][2], pairs[i][3]);
    if v_new = v_def then raise exception '%: expected text not found', f; end if;
    execute v_new;
  end loop;
end $$;

create or replace function public.console_set_limits(p_org uuid, p_staff integer, p_offices integer, p_visits integer, p_months integer, p_note text, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','finance'], p_reason, true);
  if not exists (select 1 from public.organizations where id = p_org) then raise exception 'Company not found.'; end if;
  if p_months is not null and (p_months < 1 or p_months > 120) then raise exception 'Months must be between 1 and 120.'; end if;
  if p_staff is null and p_offices is null and p_visits is null then
    delete from public.org_limit_overrides where org_id = p_org;
  else
    insert into public.org_limit_overrides (org_id, max_staff, max_offices, max_visits_month, ends_at, note, updated_by, updated_at)
    values (p_org, p_staff, p_offices, p_visits, case when p_months is not null then now() + make_interval(months => p_months) end,
            nullif(trim(coalesce(p_note, '')), ''), auth.uid(), now())
    on conflict (org_id) do update set max_staff = excluded.max_staff, max_offices = excluded.max_offices, max_visits_month = excluded.max_visits_month,
      ends_at = excluded.ends_at, note = excluded.note, updated_by = excluded.updated_by, updated_at = now();
  end if;
  perform public.console_log(p_org, 'company.limits', p_reason,
    jsonb_build_object('staff', p_staff, 'offices', p_offices, 'visits', p_visits, 'months', p_months));
end $$;
revoke all on function public.console_set_limits(uuid, integer, integer, integer, integer, text, text) from public, anon;
grant execute on function public.console_set_limits(uuid, integer, integer, integer, integer, text, text) to authenticated;

create or replace function public.console_limits(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare o public.org_limit_overrides;
begin
  perform public.console_require(array['owner','support','finance','viewer']);
  select * into o from public.org_limit_overrides where org_id = p_org;
  return jsonb_build_object('staff', o.max_staff, 'offices', o.max_offices, 'visits', o.max_visits_month, 'ends_at', o.ends_at, 'note', o.note,
    'active', o.org_id is not null and (o.ends_at is null or o.ends_at > now()));
end $$;
revoke all on function public.console_limits(uuid) from public, anon;
grant execute on function public.console_limits(uuid) to authenticated;

-- ───────────────────────────────────────────── data protection request tracker
create table if not exists public.data_requests (
  id              uuid primary key default gen_random_uuid(),
  number          bigint generated always as identity unique,
  org_id          uuid references public.organizations(id) on delete set null,
  requester_name  text not null check (length(trim(requester_name)) between 2 and 120),
  requester_email text check (requester_email is null or length(requester_email) <= 200),
  relationship    text not null default 'staff' check (relationship in ('staff','visitor','admin','prospect','other')),
  kind            text not null check (kind in ('access','correction','deletion','objection','restriction','portability','complaint','other')),
  received_at     date not null default current_date,
  due_at          date not null,
  status          text not null default 'new' check (status in ('new','verifying','in_progress','with_company','completed','refused')),
  details         text check (details is null or length(details) <= 4000),
  outcome         text check (outcome is null or length(outcome) <= 4000),
  completed_at    timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  updated_at      timestamptz not null default now()
);
alter table public.data_requests enable row level security;
revoke all on public.data_requests from public, anon, authenticated;

create or replace function public.console_data_requests(p_open_only boolean default true)
returns setof public.data_requests language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','viewer']);
  return query select * from public.data_requests
   where not coalesce(p_open_only, true) or status not in ('completed','refused')
   order by case when status in ('completed','refused') then 1 else 0 end, due_at, received_at desc limit 500;
end $$;
revoke all on function public.console_data_requests(boolean) from public, anon;
grant execute on function public.console_data_requests(boolean) to authenticated;

-- The NDPA and the GDPR give one month to answer; we track 30 days from receipt.
create or replace function public.console_save_data_request(p_id uuid, p jsonb, p_reason text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_id uuid := p_id; v_received date := coalesce(nullif(p ->> 'received_at', '')::date, current_date); v_status text := coalesce(p ->> 'status', 'new');
begin
  perform public.console_require(array['owner','support'], p_reason, true);
  if v_id is null then
    insert into public.data_requests (org_id, requester_name, requester_email, relationship, kind, received_at, due_at, status, details, created_by)
    values (nullif(p ->> 'org_id', '')::uuid, trim(p ->> 'requester_name'), nullif(trim(coalesce(p ->> 'requester_email', '')), ''),
            coalesce(p ->> 'relationship', 'staff'), p ->> 'kind', v_received, v_received + 30, v_status,
            nullif(trim(coalesce(p ->> 'details', '')), ''), auth.uid())
    returning id into v_id;
  else
    update public.data_requests set status = v_status,
      outcome = coalesce(nullif(trim(coalesce(p ->> 'outcome', '')), ''), outcome),
      due_at = coalesce(nullif(p ->> 'due_at', '')::date, due_at),
      completed_at = case when v_status in ('completed','refused') then coalesce(completed_at, now()) else null end,
      updated_at = now()
     where id = v_id;
    if not found then raise exception 'Request not found.'; end if;
  end if;
  perform public.console_log(nullif(p ->> 'org_id', '')::uuid, 'privacy.request', p_reason, jsonb_build_object('request', v_id, 'status', v_status));
  return v_id;
end $$;
revoke all on function public.console_save_data_request(uuid, jsonb, text) from public, anon;
grant execute on function public.console_save_data_request(uuid, jsonb, text) to authenticated;

-- ───────────────────────────────────────────── jobs and email health
create table if not exists public.job_runs (
  id          bigint generated always as identity primary key,
  job         text not null check (length(job) <= 60),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  detail      text check (detail is null or length(detail) <= 1000)
);
create index if not exists job_runs_job_idx on public.job_runs (job, started_at desc);
create table if not exists public.email_log (
  id          bigint generated always as identity primary key,
  kind        text not null check (length(kind) <= 60),
  to_domain   text check (to_domain is null or length(to_domain) <= 200),
  ok          boolean not null,
  detail      text check (detail is null or length(detail) <= 300),
  created_at  timestamptz not null default now()
);
create index if not exists email_log_created_idx on public.email_log (created_at desc);
alter table public.job_runs enable row level security;
alter table public.email_log enable row level security;
revoke all on public.job_runs, public.email_log from public, anon, authenticated;
grant select, insert, update, delete on public.job_runs, public.email_log to service_role;

-- Only the email domain is kept, not the address, and the log is cleared after 30 days.
create or replace function public.purge_operations_logs()
returns void language sql security definer set search_path = pg_catalog, public, pg_temp as $$
  delete from public.email_log where created_at < now() - interval '30 days';
  delete from public.job_runs where started_at < now() - interval '30 days';
$$;
revoke all on function public.purge_operations_logs() from public, anon, authenticated;
grant execute on function public.purge_operations_logs() to service_role;

create or replace function public.console_operations()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','finance','viewer']);
  return jsonb_build_object(
    'jobs', coalesce((select jsonb_agg(j order by j.job) from (
        select distinct on (job) job, started_at, finished_at, ok, detail,
               (select count(*) from public.job_runs r where r.job = x.job and r.ok = false and r.started_at > now() - interval '24 hours') as failures_24h
          from public.job_runs x order by job, started_at desc) j), '[]'::jsonb),
    'emails', jsonb_build_object(
        'sent_24h', (select count(*) from public.email_log where ok and created_at > now() - interval '24 hours'),
        'failed_24h', (select count(*) from public.email_log where not ok and created_at > now() - interval '24 hours'),
        'sent_7d', (select count(*) from public.email_log where ok and created_at > now() - interval '7 days'),
        'failed_7d', (select count(*) from public.email_log where not ok and created_at > now() - interval '7 days'),
        'recent_failures', coalesce((select jsonb_agg(e order by e.created_at desc) from (
            select kind, to_domain, detail, created_at from public.email_log where not ok order by created_at desc limit 20) e), '[]'::jsonb)),
    'payments', jsonb_build_object(
        'failed_7d', (select count(*) from public.payments where status = 'failed' and created_at > now() - interval '7 days'),
        'pending_over_1h', (select count(*) from public.payments where status = 'pending' and created_at < now() - interval '1 hour'),
        'renewal_sync_pending', (select count(*) from public.payments where status = 'applied' and renewal_sync_status = 'pending'),
        'recent_failed', coalesce((select jsonb_agg(p order by p.created_at desc) from (
            select py.reference, o.name as org_name, py.kind, py.amount_kobo, py.provider, py.created_at
              from public.payments py join public.organizations o on o.id = py.org_id
             where py.status = 'failed' order by py.created_at desc limit 20) p), '[]'::jsonb)),
    'support', jsonb_build_object(
        'open', (select count(*) from public.support_tickets where status = 'open'),
        'urgent_open', (select count(*) from public.support_tickets where status = 'open' and priority = 'urgent')),
    'privacy', jsonb_build_object(
        'open', (select count(*) from public.data_requests where status not in ('completed','refused')),
        'overdue', (select count(*) from public.data_requests where status not in ('completed','refused') and due_at < current_date)));
end $$;
revoke all on function public.console_operations() from public, anon;
grant execute on function public.console_operations() to authenticated;

commit;
