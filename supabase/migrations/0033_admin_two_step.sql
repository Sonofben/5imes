-- 5ime: company owners and admins need two-step sign-in (aal2) in the database too, not only in the app.
--
-- Until now only Global Admin was enforced here (0006). The app checked company admins in
-- requireMember({ admin }), but RLS and RPCs that rely on is_org_admin() / is_org_viewer() /
-- is_visitor_desk() trusted the role alone, so an owner or admin signed in with just a password
-- could read admin data straight from the API.
--
-- From this migration an owner or admin counts as an admin (or viewer, or visitor desk) only when
-- the session has passed two-step sign-in (JWT aal = 'aal2'), or during the existing 10-minute
-- recovery-code window bound to the same session (see requireMember and 0008). Managers and
-- reception staff are unchanged: they are not required to use two-step sign-in yet.
-- An owner or admin without aal2 keeps everything an ordinary member has (their own check-in,
-- leave, tasks), so /app keeps working while they finish setting up two-step sign-in.

begin;

create or replace function public.admin_mfa_satisfied()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or exists (
           select 1 from public.member_security_events e
            where e.user_id = auth.uid()
              and e.kind = 'recovery_used'
              and e.session_id is not null
              and e.session_id::text = nullif(auth.jwt() ->> 'session_id', '')
              and e.created_at > now() - interval '10 minutes')
$$;
revoke all on function public.admin_mfa_satisfied() from public, anon;
grant execute on function public.admin_mfa_satisfied() to authenticated, service_role;

create or replace function public.is_org_admin()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select coalesce(public.my_role() in ('owner','admin'), false) and public.admin_mfa_satisfied();
$$;

create or replace function public.is_org_viewer()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select coalesce(public.my_role() = 'manager', false)
      or (coalesce(public.my_role() in ('owner','admin'), false) and public.admin_mfa_satisfied());
$$;

create or replace function public.is_visitor_desk()
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select coalesce((select m.status = 'active'
                          and (m.role = 'manager' or m.can_reception
                               or (m.role in ('owner','admin') and public.admin_mfa_satisfied()))
                     from public.members m where m.user_id = auth.uid() limit 1), false)
$$;

commit;
