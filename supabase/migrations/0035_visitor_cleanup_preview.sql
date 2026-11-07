-- 5ime: see what the visitor clean-up (vms_purge_expired, 0016) would do, per company, without doing it.
--
-- The clean-up now runs every 5 minutes from the server timer as well as when /visitors is opened.
-- This read-only function counts, for each company, what is due under exactly the same rules:
--   details_due  visits whose personal details are past the company's own retention_days (default 90)
--   photos_due   visitor photos past the company's own photo_retention_days (default 30)
--   sign_out_due visitors still on site 16 hours after signing in (signed out automatically)
--   waiting_due  arrivals reception never answered within 12 hours (cancelled)
--   audit_due    visitor audit entries older than 2 years (deleted)
-- Counts only: no names, emails or phone numbers. The app uses it for the dry run and, around a live
-- run, to record how much was done for each company. Service role only.

begin;

create or replace function public.vms_purge_preview()
returns table (org_id uuid, details_due integer, photos_due integer, sign_out_due integer, waiting_due integer, audit_due integer)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  with details as (
    select v.org_id, count(*)::integer n from public.visits v
      left join public.visitor_settings s on s.org_id = v.org_id
     where v.personal_data_deleted_at is null and v.status not in ('on_site','waiting')
       and coalesce(v.signed_out_at, v.signed_in_at, v.arrived_at, v.expected_at, v.created_at) < now() - make_interval(days => coalesce(s.retention_days, 90))
     group by v.org_id
  ), photos as (
    select v.org_id, count(*)::integer n from public.visits v
      left join public.visitor_settings s on s.org_id = v.org_id
     where v.photo_path is not null and v.status <> 'on_site'
       and coalesce(v.signed_out_at, v.signed_in_at, v.created_at) < now() - make_interval(days => coalesce(s.photo_retention_days, 30))
     group by v.org_id
  ), sign_outs as (
    select v.org_id, count(*)::integer n from public.visits v
     where v.status = 'on_site' and v.signed_in_at < now() - interval '16 hours'
     group by v.org_id
  ), waiting as (
    select v.org_id, count(*)::integer n from public.visits v
     where v.status = 'waiting' and v.arrived_at < now() - interval '12 hours'
     group by v.org_id
  ), audit as (
    select a.org_id, count(*)::integer n from public.visitor_audit a
     where a.at < now() - interval '2 years'
     group by a.org_id
  ), orgs as (
    select details.org_id from details union select photos.org_id from photos union select sign_outs.org_id from sign_outs
    union select waiting.org_id from waiting union select audit.org_id from audit
  )
  select o.org_id, coalesce(d.n, 0), coalesce(p.n, 0), coalesce(so.n, 0), coalesce(w.n, 0), coalesce(a.n, 0)
    from orgs o
    left join details d on d.org_id = o.org_id
    left join photos p on p.org_id = o.org_id
    left join sign_outs so on so.org_id = o.org_id
    left join waiting w on w.org_id = o.org_id
    left join audit a on a.org_id = o.org_id
   order by o.org_id
$$;
revoke all on function public.vms_purge_preview() from public, anon, authenticated;
grant execute on function public.vms_purge_preview() to service_role;

commit;
