-- 5ime: make my_security_status readable by signed-in users.
--
-- The 0007 view ran with security_invoker, so it read auth.mfa_factors and
-- auth_recovery_codes as the `authenticated` role. On Supabase that role has no
-- access to auth.mfa_factors, and auth_recovery_codes denies direct reads, so the
-- view errored (or always reported 0 codes). The security page then told enrolled
-- admins to set up two-factor again.
--
-- Fix: one SECURITY DEFINER function that only ever reports on auth.uid(), and a
-- view over it so existing queries keep working. Apply after 0008. Safe to re-run.
begin;

create or replace function public.my_security_status_fn()
returns table (user_id uuid, totp_enrolled boolean, unused_recovery_codes int)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select
    auth.uid(),
    exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified' and f.factor_type = 'totp'
    ),
    coalesce((
      select count(*) from public.auth_recovery_codes c
      where c.user_id = auth.uid() and c.used_at is null
    ), 0)::int
  where auth.uid() is not null
$$;

revoke all on function public.my_security_status_fn() from public, anon;
grant execute on function public.my_security_status_fn() to authenticated;

drop view if exists public.my_security_status;
create view public.my_security_status with (security_invoker = on) as
  select * from public.my_security_status_fn();

revoke all on public.my_security_status from public, anon;
grant select on public.my_security_status to authenticated;

commit;
