-- 5ime: explicit table permissions for the Supabase API roles.
--
-- Newer Supabase projects no longer give the `authenticated` and `service_role`
-- roles automatic access to tables created in SQL. 0001–0009 relied on that
-- automatic access for the core tables, so on such a project every signed-in
-- read of `members` failed with "permission denied for table members" and /admin
-- bounced back to /start.
--
-- This migration states every permission the app needs. Row-level security
-- (which company, which person) is unchanged and still applies on top. Tables
-- that are deliberately closed to signed-in users (payments, private billing
-- auth, recovery codes, platform staff/audit) stay closed to them.
--
-- Apply after 0009. Safe to re-run.
begin;

grant usage on schema public to anon, authenticated, service_role;

-- ── Signed-in users (always filtered by RLS) ──────────────────────────────
grant select on public.organizations to authenticated;          -- update: column grants in 0001/0006
grant select on public.subscriptions to authenticated;          -- admins only, by RLS
grant select, delete on public.members to authenticated;         -- update: column grants in 0001
grant select, insert, update, delete on public.locations to authenticated; -- writes: admins only, by RLS
grant select on public.schedules to authenticated;               -- writes go through replace_schedule()
grant select on public.member_security_events to authenticated;  -- inserts go through RPCs only
grant select on public.member_private_locations to authenticated;
grant select on public.private_attendance_locations to authenticated;
grant select on public.attendance_correction_requests to authenticated;
grant select on public.attendance_correction_audit to authenticated;
grant select on public.support_access_grants to authenticated;
grant select on public.member_latest_attendance to authenticated;
grant select on public.my_security_status to authenticated;
-- attendance: column-level select from 0004 (no IP / device columns) — unchanged.

-- ── Server-only service role (never sent to browsers) ─────────────────────
-- Used for payments, invitations, logo uploads and the Kora Forge console.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

commit;
