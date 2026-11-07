-- 5ime: a fresh two-step code before sensitive actions ("step-up").
--
-- Signing in with two-step once is not enough for actions that are hard to undo or that take data
-- out of 5ime: exports, deleting staff, erasing a visitor's data, deleting a company, resetting
-- someone's two-step sign-in. For those the person types a current authenticator code again.
--
-- How it works: the app verifies the code with Supabase Auth on the server
-- (/api/security/step-up) and then records it here with the service role, bound to the current
-- session (the JWT's session_id), the same way recovery-code use is bound in 0008. An action counts
-- as freshly verified for 5 minutes. Nobody can write this table from the browser.

begin;

create table if not exists public.step_up_verifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users on delete cascade,
  session_id  uuid not null,
  verified_at timestamptz not null default now()
);
create index if not exists step_up_verifications_lookup on public.step_up_verifications (user_id, session_id, verified_at desc);
alter table public.step_up_verifications enable row level security;
-- No policies: only the service role (which bypasses RLS) and the functions below use it.
revoke all on public.step_up_verifications from public, anon, authenticated;
grant select, insert, delete on public.step_up_verifications to service_role;

-- Called by the server after Supabase Auth accepted the code. Keeps only the last day per person.
create or replace function public.record_step_up(p_user uuid, p_session uuid)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if p_user is null or p_session is null then raise exception 'A signed-in session is required.'; end if;
  delete from public.step_up_verifications where user_id = p_user and verified_at < now() - interval '1 day';
  insert into public.step_up_verifications (user_id, session_id) values (p_user, p_session);
end $$;
revoke all on function public.record_step_up(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_step_up(uuid, uuid) to service_role;

-- Has the caller typed a fresh code in this session within the last 5 minutes?
create or replace function public.step_up_fresh()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (
    select 1 from public.step_up_verifications v
     where v.user_id = auth.uid()
       and v.session_id::text = nullif(auth.jwt() ->> 'session_id', '')
       and v.verified_at > now() - interval '5 minutes'
       and v.verified_at <= now() + interval '1 minute')
$$;
revoke all on function public.step_up_fresh() from public, anon;
grant execute on function public.step_up_fresh() to authenticated;

-- Raise the step-up error. KF412 lets the app send the person to the code screen.
create or replace function public.require_step_up()
returns void language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not public.step_up_fresh() then
    raise exception 'Enter a fresh code from your authenticator app to do this.' using errcode = 'KF412';
  end if;
end $$;
revoke all on function public.require_step_up() from public, anon;
grant execute on function public.require_step_up() to authenticated;

-- A new limit bucket for the code screen; the rest is unchanged from 0014.
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
    when 'step_up'         then perform public.rate_limit_hit(p_bucket, v_user, 10,  interval '15 minutes');
    else raise exception 'Unknown limit %.', p_bucket;
  end case;
end $$;
revoke all on function public.throttle(text) from public, anon;
grant execute on function public.throttle(text) to authenticated;

-- ───────────────────────────────────────────── company side
-- Removing a person needs a fresh code (on top of the admin rule in member_delete).
drop policy if exists member_delete_step_up on public.members;
create policy member_delete_step_up on public.members as restrictive for delete to authenticated
  using (public.step_up_fresh());

-- Add the fresh-code check to the live definition of each function, right after its existing
-- permission check, the same way 0014 added rate limits. Rebuilding from the live definition keeps
-- every earlier change (for example the limits 0014 inserted); a missing anchor stops the migration.
do $$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select * from (values
      -- Visitor log export: owners and admins (managers aren't required to use two-step yet).
      ('public.vms_log_export(date,date)',
       '(if not public\.is_org_viewer\(\) then raise exception [^;]*; end if;)',
       $s$if public.my_role() in ('owner','admin') then perform public.require_step_up(); end if;$s$),
      -- Erasing a visitor's data.
      ('public.vms_forget_visitor(text)',
       '(if not public\.is_org_admin\(\) then raise exception [^;]*; end if;)',
       'perform public.require_step_up();'),
      -- Global Admin: delete a company, reset someone's two-step sign-in, export a company.
      ('public.console_delete_company(uuid,text,text)', '(perform public\.console_require\([^;]*\);)', 'perform public.require_step_up();'),
      ('public.console_reset_mfa(uuid,text)',           '(perform public\.console_require\([^;]*\);)', 'perform public.require_step_up();'),
      ('public.console_company_export(uuid,text)',      '(perform public\.console_require\([^;]*\);)', 'perform public.require_step_up();')
    ) as t(fn, anchor, stmt)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    continue when position('require_step_up()' in v_def) > 0;   -- already there
    v_new := regexp_replace(v_def, r.anchor, '\1' || E'\n  ' || r.stmt);
    if v_new = v_def then raise exception 'Could not add the fresh-code check to %.', r.fn; end if;
    execute v_new;
  end loop;
end $$;

commit;
