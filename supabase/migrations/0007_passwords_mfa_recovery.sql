-- 5ime: password-based auth, admin TOTP enforcement, recovery codes.
-- Apply after 0006. Idempotent where possible so partial runs can be rerun.
begin;

-- ───────────────────────────────────────────── one-use recovery codes (TOTP backup)
-- Codes are stored only as hashes. The plaintext is shown once at generation time
-- and never retrievable again. Verifying consumes the row.
create table if not exists public.auth_recovery_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  code_hash   text not null,                                       -- bcrypt / crypt() hash
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);
create index if not exists auth_recovery_codes_user on public.auth_recovery_codes(user_id) where used_at is null;

alter table public.auth_recovery_codes enable row level security;

-- Service role only. No end-user access via PostgREST.
drop policy if exists auth_recovery_codes_no_direct_access on public.auth_recovery_codes;
create policy auth_recovery_codes_no_direct_access
  on public.auth_recovery_codes for all to authenticated
  using (false) with check (false);

-- ───────────────────────────────────────────── per-user security snapshot
-- Convenience view: lets admin pages tell whether the signed-in user has
-- enrolled TOTP and how many unused recovery codes remain, without exposing
-- auth.users or the code hashes directly.
create or replace view public.my_security_status with (security_invoker = on) as
  select
    (auth.uid())                                                     as user_id,
    exists (
      select 1 from auth.mfa_factors
      where user_id = auth.uid() and status = 'verified' and factor_type = 'totp'
    )                                                                as totp_enrolled,
    coalesce((
      select count(*) from public.auth_recovery_codes
      where user_id = auth.uid() and used_at is null
    ), 0)::int                                                       as unused_recovery_codes;

grant select on public.my_security_status to authenticated;

-- ───────────────────────────────────────────── recovery-code RPCs (service role)
-- These helpers run as security definer so the browser's anon key cannot read
-- or write auth_recovery_codes directly — only via these functions.

-- Replace all of a user's current recovery codes with newly-hashed ones.
-- Called by the admin "regenerate recovery codes" action on the server; the
-- caller must prove MFA (aal2) before invoking.
create or replace function public.replace_recovery_codes(p_hashes text[])
returns int language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_count int;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if coalesce(array_length(p_hashes, 1), 0) < 6 or coalesce(array_length(p_hashes, 1), 0) > 20 then
    raise exception 'recovery code batch must have 6..20 entries';
  end if;
  delete from public.auth_recovery_codes where user_id = v_uid;
  insert into public.auth_recovery_codes (user_id, code_hash)
    select v_uid, h from unnest(p_hashes) as h;
  select count(*) into v_count from public.auth_recovery_codes where user_id = v_uid and used_at is null;
  return v_count;
end $$;

revoke all on function public.replace_recovery_codes(text[]) from public;
grant execute on function public.replace_recovery_codes(text[]) to authenticated;

-- List unused recovery-code hashes for the signed-in user. The server verifies
-- the submitted plaintext against these using crypto.timingSafeEqual + bcrypt
-- compare, then calls consume_recovery_code with the matching id.
create or replace function public.list_my_recovery_hashes()
returns table (id uuid, code_hash text)
language sql security definer set search_path = pg_catalog, public, pg_temp as $$
  select id, code_hash from public.auth_recovery_codes
  where user_id = auth.uid() and used_at is null
  order by created_at;
$$;

revoke all on function public.list_my_recovery_hashes() from public;
grant execute on function public.list_my_recovery_hashes() to authenticated;

-- Mark one specific code consumed (after the server verified it).
create or replace function public.consume_recovery_code(p_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_rows int;
begin
  if v_uid is null then return false; end if;
  update public.auth_recovery_codes
    set used_at = now()
    where id = p_id and user_id = v_uid and used_at is null;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end $$;

revoke all on function public.consume_recovery_code(uuid) from public;
grant execute on function public.consume_recovery_code(uuid) to authenticated;

-- ───────────────────────────────────────────── member-level MFA audit entries
-- Reuse the existing platform_audit shape via a lightweight per-company audit
-- for recovery-code use so the owner can later see "Jane used a recovery code
-- on 2026-10-11 at 09:14".
create table if not exists public.member_security_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations on delete cascade,
  member_id   uuid references public.members on delete set null,
  user_id     uuid references auth.users on delete set null,
  kind        text not null check (kind in (
    'password_set', 'password_changed', 'password_reset',
    'totp_enrolled', 'totp_disabled',
    'recovery_regenerated', 'recovery_used'
  )),
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists member_security_events_org on public.member_security_events(org_id, created_at desc);
create index if not exists member_security_events_user on public.member_security_events(user_id, created_at desc);

alter table public.member_security_events enable row level security;

drop policy if exists msec_read_org_admin on public.member_security_events;
create policy msec_read_org_admin
  on public.member_security_events for select to authenticated
  using (
    exists (
      select 1 from public.members m
      where m.org_id = member_security_events.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
        and m.status = 'active'
    )
  );

-- Writes are always via SECURITY DEFINER server actions (never direct).
drop policy if exists msec_no_direct_writes on public.member_security_events;
create policy msec_no_direct_writes
  on public.member_security_events for insert to authenticated
  with check (false);

create or replace function public.log_security_event(p_kind text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_member record;
begin
  if v_uid is null then return; end if;
  select id, org_id into v_member from public.members where user_id = v_uid limit 1;
  insert into public.member_security_events (org_id, member_id, user_id, kind, detail)
    values (v_member.org_id, v_member.id, v_uid, p_kind, coalesce(p_detail, '{}'::jsonb));
end $$;

revoke all on function public.log_security_event(text, jsonb) from public;
grant execute on function public.log_security_event(text, jsonb) to authenticated;

-- ───────────────────────────────────────────── protect new password policy at the row level
-- Nothing stored here — Supabase handles password hashing in auth.users. But we
-- keep a small marker on members so the "set up 2FA" banner can hide itself
-- once owner/admin complete enrolment, without hitting auth.mfa_factors on
-- every page load (expensive and requires elevated reads).
alter table public.members
  add column if not exists mfa_last_enrolled_at timestamptz;

commit;
