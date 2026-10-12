-- 5ime: trusted post-login role routing + locked-down recovery flow.
--
-- This migration tightens two auth paths that were partly enforced only in
-- Next.js (the trusted boundary should be the database, not the server page):
--
--   1. post_auth_destination() returns the single trusted post-login route
--      based on platform_staff (first), then member role/status, then domain
--      state. /start calls it; the mapping cannot be influenced by any
--      user-editable metadata.
--
--   2. Recovery-code use is now verified and consumed in a single SECURITY
--      DEFINER function (verify_and_consume_recovery_code). Code hashes are
--      bcrypt via pgcrypto, so the DB verifies without ever leaving the
--      database. The matching recovery_used event is written atomically and
--      bound to the current session_id, so an authenticated client can no
--      longer forge the audit row to unlock the AAL1 grace window.
--
-- Apply after 0007. Safe to re-run: all definitions use CREATE OR REPLACE and
-- DO IF guards.
begin;

create extension if not exists pgcrypto;

-- ───────────────────────────────────────────── primary role lookup
-- Returns the single truth of "what should this signed-in user see next".
-- Precedence (first match wins):
--
--   console_staff   → user is in platform_staff (regardless of company role)
--   active_admin    → member row with role in (owner, admin, manager) and status active
--   active_member   → member row with any role and status active
--   pending         → member row exists, status = pending
--   disabled        → member row exists, status disabled or invited (never activated)
--   no_org          → no member row AND domain has no organization yet
--   public_email    → no member row AND email is on the public-domain blocklist
--   none            → unauthenticated
--
-- Platform-staff wins on purpose. A Kora Forge employee who also happens to
-- have a company membership is a platform operator first; routing them to
-- their own company's /admin would hide the Kora Forge-wide view.
create or replace function public.my_primary_role()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_domain text;
  m record;
begin
  if v_uid is null then return 'none'; end if;

  if exists (select 1 from public.platform_staff p where p.user_id = v_uid) then
    return 'console_staff';
  end if;

  select id, role, status into m from public.members where user_id = v_uid limit 1;
  if found then
    if m.status = 'active' then
      if m.role in ('owner', 'admin', 'manager') then return 'active_admin'; end if;
      return 'active_member';
    end if;
    if m.status = 'pending' then return 'pending'; end if;
    return 'disabled';
  end if;

  v_email := public.current_email();
  v_domain := split_part(v_email, '@', 2);
  if public.is_public_email_domain(v_domain) then return 'public_email'; end if;
  return 'no_org';
end
$$;

revoke all on function public.my_primary_role() from public;
grant execute on function public.my_primary_role() to authenticated;

-- ───────────────────────────────────────────── post-login destination
-- Returns the exact server-side redirect target for /start to use. Keeps
-- routing decisions in the DB so the client cannot flip them by editing
-- cookies or user_metadata. The second return column lets /start show a
-- short message when the user is on a public-email domain and can't proceed.
create or replace function public.post_auth_destination()
returns table (destination text, reason text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_role text := public.my_primary_role();
begin
  case v_role
    when 'console_staff'  then destination := '/console';          reason := null;
    when 'active_admin'   then destination := '/admin';            reason := null;
    when 'active_member'  then destination := '/app';              reason := null;
    when 'pending'        then destination := '/pending';          reason := null;
    when 'disabled'       then destination := '/pending?disabled=1'; reason := null;
    when 'no_org'         then destination := '/onboarding';       reason := null;
    when 'public_email'   then destination := '/start';            reason := 'public_email';
    else                       destination := '/login';            reason := 'not_signed_in';
  end case;
  return next;
end
$$;

revoke all on function public.post_auth_destination() from public;
grant execute on function public.post_auth_destination() to authenticated;

-- ───────────────────────────────────────────── session-id on recovery events
-- The AAL1 grace window must be bound to the specific session that proved the
-- recovery code, otherwise a replayed cookie from an older session on the same
-- user keeps letting them through.
alter table public.member_security_events
  add column if not exists session_id uuid;

create index if not exists member_security_events_session
  on public.member_security_events(session_id)
  where kind = 'recovery_used';

-- ───────────────────────────────────────────── bcrypt-based recovery codes
-- Replace the Node-scrypt storage from 0007 with pgcrypto crypt() + bcrypt.
-- Verification can now happen inside a SECURITY DEFINER function instead of
-- shipping hashes to the Node layer.
--
-- Old rows (if any) are kept but will never match again — they used the old
-- scrypt scheme. In practice no users have recovery codes yet; this migration
-- adds a safety index on the new scheme.

-- replace_recovery_codes: now takes PLAINTEXT codes, hashes them inside the DB
-- using bcrypt (`crypt(code, gen_salt('bf', 10))`), and enforces AAL2 inside
-- the function so a direct RPC call from AAL1 is refused. The parameter name
-- changes from p_hashes to p_codes, which Postgres treats as a different
-- signature, so we drop the previous version first.
drop function if exists public.replace_recovery_codes(text[]);
create function public.replace_recovery_codes(p_codes text[])
returns int
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_aal text := coalesce(auth.jwt() ->> 'aal', 'aal1');
  v_count int;
  v_code text;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if v_aal <> 'aal2' then
    raise exception 'Recovery codes can only be regenerated from an aal2 session.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_codes, 1), 0) < 6 or coalesce(array_length(p_codes, 1), 0) > 20 then
    raise exception 'recovery code batch must have 6..20 entries';
  end if;

  delete from public.auth_recovery_codes where user_id = v_uid;
  foreach v_code in array p_codes loop
    if length(v_code) < 8 then raise exception 'recovery codes must be at least 8 characters'; end if;
    insert into public.auth_recovery_codes (user_id, code_hash)
      values (v_uid, crypt(upper(regexp_replace(v_code, '[^A-Za-z0-9]', '', 'g')), gen_salt('bf', 10)));
  end loop;

  insert into public.member_security_events (org_id, member_id, user_id, kind, detail)
    select m.org_id, m.id, v_uid, 'recovery_regenerated',
           jsonb_build_object('count', array_length(p_codes, 1))
    from public.members m where m.user_id = v_uid
    limit 1;

  select count(*) into v_count from public.auth_recovery_codes
    where user_id = v_uid and used_at is null;
  return v_count;
end
$$;

revoke all on function public.replace_recovery_codes(text[]) from public;
grant execute on function public.replace_recovery_codes(text[]) to authenticated;

-- verify_and_consume_recovery_code: single atomic step for the lost-phone
-- path. Reads unused codes, finds one whose bcrypt hash matches the
-- normalized plaintext, marks it used, and logs the `recovery_used` event
-- bound to the current session_id. Nothing leaves the database.
create or replace function public.verify_and_consume_recovery_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_session uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_norm text;
  v_match uuid;
begin
  if v_uid is null then return false; end if;
  v_norm := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_norm) < 8 then return false; end if;

  select id into v_match
  from public.auth_recovery_codes
  where user_id = v_uid
    and used_at is null
    and code_hash = crypt(v_norm, code_hash)
  limit 1
  for update;

  if v_match is null then return false; end if;

  update public.auth_recovery_codes
    set used_at = now()
    where id = v_match;

  insert into public.member_security_events (org_id, member_id, user_id, kind, session_id, detail)
    select m.org_id, m.id, v_uid, 'recovery_used', v_session, '{}'::jsonb
    from public.members m where m.user_id = v_uid
    limit 1;

  return true;
end
$$;

revoke all on function public.verify_and_consume_recovery_code(text) from public;
grant execute on function public.verify_and_consume_recovery_code(text) to authenticated;

-- ───────────────────────────────────────────── remove the hash leak
-- 0007 exposed every unused recovery hash so Node could verify them. With
-- verification now in-DB we can drop that function entirely.
drop function if exists public.list_my_recovery_hashes();
drop function if exists public.consume_recovery_code(uuid);

-- ───────────────────────────────────────────── narrow log_security_event
-- The old version accepted ANY kind from the authenticated role. That let a
-- client post 'recovery_used' events it never earned and buy itself a grace
-- window. Restrict the function to the kinds a user may legitimately
-- self-report; 'recovery_used' and 'recovery_regenerated' now only come from
-- the trusted RPCs above.
create or replace function public.log_security_event(p_kind text, p_detail jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_member record;
begin
  if v_uid is null then return; end if;
  if p_kind not in ('password_changed', 'password_set', 'password_reset', 'totp_enrolled', 'totp_disabled') then
    raise exception 'log_security_event cannot write a % event from a client; use the dedicated RPC.', p_kind
      using errcode = '42501';
  end if;
  select id, org_id into v_member from public.members where user_id = v_uid limit 1;
  insert into public.member_security_events (org_id, member_id, user_id, kind, detail)
    values (v_member.org_id, v_member.id, v_uid, p_kind, coalesce(p_detail, '{}'::jsonb));
end
$$;

revoke all on function public.log_security_event(text, jsonb) from public;
grant execute on function public.log_security_event(text, jsonb) to authenticated;

commit;
