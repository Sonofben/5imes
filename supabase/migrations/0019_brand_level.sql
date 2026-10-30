-- 0019 · How much of its brand a company shows outside the app (sign-in page, phone icon, browser tab).
--   'full' (Pro, Premium, trial): logo and colours everywhere.
--   'logo' (Basic): the logo stays inside the app and admin area; public pages keep 5ime's look.
create or replace function public.org_brand_level(p_slug text)
returns text language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select case when public.org_has_brand_colors(o.id) then 'full' else 'logo' end
    from public.organizations o where o.slug = lower(p_slug)
$$;
revoke all on function public.org_brand_level(text) from public;
grant execute on function public.org_brand_level(text) to anon, authenticated, service_role;
