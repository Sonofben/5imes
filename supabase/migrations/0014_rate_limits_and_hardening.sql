-- 5ime: rate limits on every action that sends email, spends money, writes records
-- or touches security, plus small hardening fixes. Apply after 0013. Safe to re-run.
--
-- How it works
--   public.rate_limit_hit(bucket, subject, max, window, cost) adds `cost` to a counter for
--   (bucket, subject, current window) and refuses with SQLSTATE KF429 once the counter
--   would pass `max`. The subject is always worked out on the server (the signed-in user
--   or their company), never taken from the request. If the counter cannot be written the
--   action fails, so the limit fails closed.
--
--   The limits are added as the first statement of each database function listed below.
--   Anyone who later replaces one of those functions must keep that first line;
--   supabase/tests/95_rate_limits.sql fails if it is missing.
--
--   Note: a refused request rolls back its own counter update, so the counter records
--   successful (and, for recovery codes, failed) attempts. Side effects such as emails,
--   payments and records only happen on success, which is what the limits protect.
begin;

create table if not exists public.rate_limits (
  bucket         text not null,
  subject        text not null,
  window_start   timestamptz not null,
  window_seconds integer not null,
  max_hits       integer not null,
  hits           integer not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (bucket, subject, window_start)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from public, anon, authenticated;
create index if not exists rate_limits_recent_idx on public.rate_limits (updated_at desc);

create or replace function public.rate_limit_hit(p_bucket text, p_subject text, p_max integer, p_window interval, p_cost integer default 1)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  v_secs  integer := greatest(1, extract(epoch from p_window)::integer);
  v_start timestamptz := to_timestamp(floor(extract(epoch from clock_timestamp()) / v_secs) * v_secs);
  v_hits  integer;
begin
  if p_subject is null or p_subject = '' then
    raise exception using errcode = 'KF401', message = 'Sign in again to continue.';
  end if;
  insert into public.rate_limits as r (bucket, subject, window_start, window_seconds, max_hits, hits)
  values (p_bucket, p_subject, v_start, v_secs, p_max, greatest(1, coalesce(p_cost, 1)))
  on conflict (bucket, subject, window_start)
  do update set hits = r.hits + greatest(1, coalesce(p_cost, 1)), max_hits = excluded.max_hits, updated_at = now()
  returning hits into v_hits;
  if v_hits > p_max then
    raise exception using errcode = 'KF429', hint = p_bucket,
      message = 'Too many attempts. Please wait a while and try again.';
  end if;
  -- Light housekeeping: about one call in a hundred clears counters older than two days.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;
end $$;
revoke all on function public.rate_limit_hit(text, text, integer, interval, integer) from public, anon, authenticated;

-- ───────────────────────────────────────────── limits inside database functions
-- subject 'u:' = the signed-in user, 'o:' = their company.
do $$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select * from (values
      ('public.create_organization(text)',                           $s$perform public.rate_limit_hit('workspace_create', 'u:' || auth.uid(), 3, interval '1 day');$s$),
      ('public.join_organization()',                                 $s$perform public.rate_limit_hit('workspace_join', 'u:' || auth.uid(), 60, interval '1 hour');$s$),
      ('public.invite_member(text,text,text,text)',                  $s$perform public.rate_limit_hit('invite', 'o:' || public.my_org_id(), 600, interval '1 day');$s$),
      ('public.invite_members_bulk(jsonb)',                          $s$perform public.rate_limit_hit('invite', 'o:' || public.my_org_id(), 600, interval '1 day', jsonb_array_length(coalesce(p_members, '[]'::jsonb)));$s$),
      ('public.check_in(text,double precision,double precision,double precision,text)', $s$perform public.rate_limit_hit('check_in', 'u:' || auth.uid(), 30, interval '1 hour');$s$),
      ('public.report_presence(double precision,double precision,double precision)',   $s$perform public.rate_limit_hit('presence', 'u:' || auth.uid(), 30, interval '1 hour');$s$),
      ('public.request_work_elsewhere(double precision,double precision,double precision,text,text,text)', $s$perform public.rate_limit_hit('work_elsewhere', 'u:' || auth.uid(), 10, interval '1 hour');$s$),
      ('public.request_home_location(double precision,double precision,double precision)',      $s$perform public.rate_limit_hit('home_request', 'u:' || auth.uid(), 10, interval '1 day');$s$),
      ('public.request_home_location(double precision,double precision,double precision,text)', $s$perform public.rate_limit_hit('home_request', 'u:' || auth.uid(), 10, interval '1 day');$s$),
      ('public.request_attendance_correction(date,time without time zone,time without time zone,text)', $s$perform public.rate_limit_hit('correction_request', 'u:' || auth.uid(), 20, interval '1 day');$s$),
      ('public.verify_and_consume_recovery_code(text)',              $s$perform public.rate_limit_hit('recovery_try', 'u:' || auth.uid(), 5, interval '15 minutes');$s$),
      ('public.replace_recovery_codes(text[])',                      $s$perform public.rate_limit_hit('recovery_reset', 'u:' || auth.uid(), 10, interval '1 day');$s$),
      ('public.grant_support_access(integer)',                       $s$perform public.rate_limit_hit('support_grant', 'o:' || public.my_org_id(), 20, interval '1 day');$s$),
      ('public.prepare_paystack_subscription(text,text,integer,integer,boolean)', $s$perform public.rate_limit_hit('payment_start', 'o:' || public.my_org_id(), 20, interval '1 hour');$s$),
      ('public.prepare_paystack_seat_increase(text,integer)',        $s$perform public.rate_limit_hit('payment_start', 'o:' || public.my_org_id(), 20, interval '1 hour');$s$),
      ('public.console_invite_member(uuid,text,text,text)',          $s$perform public.rate_limit_hit('console_invite', 'u:' || auth.uid(), 60, interval '1 hour');$s$),
      ('public.console_create_company(text,text,text,text,integer,text)', $s$perform public.rate_limit_hit('console_invite', 'u:' || auth.uid(), 60, interval '1 hour');$s$),
      ('public.console_team_add(text,text,text)',                    $s$perform public.rate_limit_hit('console_invite', 'u:' || auth.uid(), 60, interval '1 hour');$s$),
      ('public.console_company_export(uuid,text)',                   $s$perform public.rate_limit_hit('console_sensitive', 'u:' || auth.uid(), 120, interval '1 hour');$s$),
      ('public.console_company_snapshot(uuid)',                      $s$perform public.rate_limit_hit('console_sensitive', 'u:' || auth.uid(), 120, interval '1 hour');$s$),
      ('public.console_find_person(text)',                           $s$perform public.rate_limit_hit('console_sensitive', 'u:' || auth.uid(), 120, interval '1 hour');$s$),
      ('public.console_force_signout(uuid,text)',                    $s$perform public.rate_limit_hit('console_sensitive', 'u:' || auth.uid(), 120, interval '1 hour');$s$),
      ('public.console_set_locked(uuid,boolean,text)',               $s$perform public.rate_limit_hit('console_sensitive', 'u:' || auth.uid(), 120, interval '1 hour');$s$),
      ('public.console_reset_mfa(uuid,text)',                        $s$perform public.rate_limit_hit('console_sensitive', 'u:' || auth.uid(), 120, interval '1 hour');$s$)
    ) as t(fn, stmt)
  loop
    if (select provolatile from pg_proc where oid = r.fn::regprocedure) <> 'v' then
      raise exception 'Cannot add a rate limit to % because it is not volatile.', r.fn;
    end if;
    v_def := pg_get_functiondef(r.fn::regprocedure);
    continue when position('rate_limit_hit(' in v_def) > 0;   -- already limited
    v_new := regexp_replace(v_def, '^(.*?\$function\$.*?\mbegin\M)', '\1' || E'\n  ' || r.stmt, 'i');
    if v_new = v_def then raise exception 'Could not add a rate limit to %.', r.fn; end if;
    execute v_new;
  end loop;
end $$;

-- ───────────────────────────────────────────── limits for actions handled by the web app
-- The web app calls throttle('<bucket>') before the action. Limits are fixed here, so a
-- caller can only spend their own allowance and cannot raise it.
create or replace function public.throttle(p_bucket text)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_user text := 'u:' || auth.uid();
begin
  case p_bucket
    when 'report_export'   then perform public.rate_limit_hit(p_bucket, v_user, 30,  interval '1 hour');
    when 'password_change' then perform public.rate_limit_hit(p_bucket, v_user, 5,   interval '1 hour');
    when 'payment_verify'  then perform public.rate_limit_hit(p_bucket, v_user, 60,  interval '1 hour');
    when 'logo_upload'     then perform public.rate_limit_hit(p_bucket, v_user, 20,  interval '1 day');
    when 'invite_email'    then perform public.rate_limit_hit(p_bucket, 'o:' || public.my_org_id(), 600, interval '1 day');
    when 'console_export'  then perform public.rate_limit_hit(p_bucket, v_user, 30,  interval '1 hour');
    when 'console_action'  then perform public.rate_limit_hit(p_bucket, v_user, 300, interval '1 hour');
    else raise exception 'Unknown limit %.', p_bucket;
  end case;
end $$;
revoke all on function public.throttle(text) from public, anon;
grant execute on function public.throttle(text) to authenticated;

-- ───────────────────────────────────────────── Global Admin: who hit a limit
create or replace function public.console_rate_limits()
returns table (bucket text, who text, company text, hits integer, max_hits integer, window_start timestamptz, window_seconds integer)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','viewer']);
  return query
    select r.bucket,
           case when r.subject like 'u:%' then coalesce((select u.email::text from auth.users u where u.id::text = substr(r.subject, 3)), r.subject)
                else null end,
           case when r.subject like 'o:%' then (select o.name from organizations o where o.id::text = substr(r.subject, 3))
                else (select o.name from members m join organizations o on o.id = m.org_id where m.user_id::text = substr(r.subject, 3) limit 1) end,
           r.hits, r.max_hits, r.window_start, r.window_seconds
      from rate_limits r
     where r.updated_at > now() - interval '7 days' and r.hits >= r.max_hits
     order by r.updated_at desc
     limit 200;
end $$;
revoke all on function public.console_rate_limits() from public, anon;
grant execute on function public.console_rate_limits() to authenticated;

-- ───────────────────────────────────────────── logo link: only the server's upload sets it
-- A company admin could otherwise point logo_url at any web address (for example a
-- tracking image that records staff IP addresses).
-- (If you move storage to a custom domain, widen this pattern in a new migration.)
revoke update (logo_url) on public.organizations from authenticated;
update public.organizations set logo_url = null
 where logo_url is not null and logo_url !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/logos/';
alter table public.organizations drop constraint if exists organizations_logo_url_format;
alter table public.organizations add constraint organizations_logo_url_format
  check (logo_url is null or (logo_url ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/logos/' and length(logo_url) <= 500));

commit;
