-- 5ime: brand kit for client companies. Apply after 0016.
--
-- A company's main colour (organizations.brand_color, from 0006) and a new accent colour, used on
-- its staff sign-in page, the staff app, visitors' phone pages, the reception poster and tablet, and
-- invitation emails. The logo is on every plan; the colours are part of Pro and Premium (and the
-- free trial). Readable text colours are worked out by the app, never chosen by hand.
begin;

alter table public.organizations add column if not exists accent_color text;
alter table public.organizations drop constraint if exists organizations_accent_color_format;
alter table public.organizations add constraint organizations_accent_color_format
  check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$');
grant update (accent_color) on public.organizations to authenticated;

-- Pro, Premium (in good standing) or a live trial.
create or replace function public.org_has_brand_colors(p_org uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select coalesce((
    select (s.status = 'trialing' and s.trial_ends_at >= now())
        or (s.plan in ('pro','premium') and s.status in ('active','past_due')
            and coalesce(s.current_period_end, now()) >= now() - interval '3 days')
      from public.subscriptions s where s.org_id = p_org), false)
$$;
revoke all on function public.org_has_brand_colors(uuid) from public, anon;
grant execute on function public.org_has_brand_colors(uuid) to authenticated, service_role;

-- Changing a colour needs a plan that includes colours. Clearing one is always allowed, and a
-- colour set earlier (for example during the trial) can stay saved; it just isn't shown.
create or replace function public.guard_brand_colors()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  -- (Values that aren't #hex are left to the format check, which gives the clearer message.)
  if ((new.brand_color is distinct from old.brand_color and new.brand_color ~ '^#[0-9a-fA-F]{6}$')
      or (new.accent_color is distinct from old.accent_color and new.accent_color ~ '^#[0-9a-fA-F]{6}$'))
     and auth.uid() is not null and not public.org_has_brand_colors(new.id) then
    raise exception 'Brand colours are part of the Pro and Premium plans. Your logo works on every plan.';
  end if;
  return new;
end $$;
revoke all on function public.guard_brand_colors() from public, anon, authenticated;
drop trigger if exists organizations_brand_guard on public.organizations;
create trigger organizations_brand_guard before update of brand_color, accent_color on public.organizations
  for each row execute function public.guard_brand_colors();

-- The brand to show for a company: logo always; colours only when its plan includes them.
create or replace function public.org_brand(p_org uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select jsonb_build_object('logo_url', o.logo_url,
    'primary', case when public.org_has_brand_colors(o.id) then o.brand_color end,
    'accent',  case when public.org_has_brand_colors(o.id) then o.accent_color end)
  from public.organizations o where o.id = p_org
$$;
revoke all on function public.org_brand(uuid) from public, anon, authenticated;
grant execute on function public.org_brand(uuid) to service_role;

-- The signed-in member's own company brand (staff app).
create or replace function public.my_org_brand()
returns jsonb language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select public.org_brand(public.my_org_id())
$$;
revoke all on function public.my_org_brand() from public, anon;
grant execute on function public.my_org_brand() to authenticated;

-- Company sign-in page (/<slug>): now with the accent, and colours only when the plan includes them.
drop function if exists public.org_branding(text);
create function public.org_branding(p_slug text)
returns table (name text, slug text, logo_url text, brand_color text, accent_color text, domain text)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select o.name, o.slug, o.logo_url,
         case when public.org_has_brand_colors(o.id) then o.brand_color end,
         case when public.org_has_brand_colors(o.id) then o.accent_color end,
         o.domain
    from public.organizations o where o.slug = lower(trim(p_slug)) and o.suspended_at is null
$$;
revoke all on function public.org_branding(text) from public;
grant execute on function public.org_branding(text) to anon, authenticated;

-- Reception tablet: the same rule for its header colour.
create or replace function public.kiosk_context(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare d public.kiosk_devices := public.kiosk_device(p_token); s public.visitor_settings := public.vms_settings_for(d.org_id); b jsonb := public.org_brand(d.org_id);
begin
  return jsonb_build_object(
    'device', d.id, 'device_name', d.name, 'org_id', d.org_id,
    'org', (select jsonb_build_object('name', o.name, 'logo_url', o.logo_url, 'brand_color', b ->> 'primary', 'accent_color', b ->> 'accent', 'timezone', o.timezone)
              from public.organizations o where o.id = d.org_id),
    'location', (select jsonb_build_object('id', l.id, 'name', l.name) from public.locations l where l.id = d.location_id),
    'photo_required', s.photo_required, 'rules_text', s.rules_text);
end $$;

-- Visitor pages carry the company brand.
create or replace function public.walkin_context(p_link text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare k public.visitor_links; s public.visitor_settings;
begin
  select * into k from public.visitor_links where token = upper(coalesce(p_link, '')) and revoked_at is null;
  if not found or not public.org_has_premium(k.org_id) then return null; end if;
  select * into s from public.visitor_settings where org_id = k.org_id;
  return jsonb_build_object(
    'org', (select jsonb_build_object('name', o.name, 'logo_url', o.logo_url, 'timezone', o.timezone) from public.organizations o where o.id = k.org_id),
    'brand', public.org_brand(k.org_id),
    'location', (select l.name from public.locations l where l.id = k.location_id),
    'open', public.vms_open_now(k.org_id),
    'rules_text', coalesce(s.rules_text, 'By signing in you agree to follow our safety rules, wear your visitor badge, and stay with your host.'),
    'privacy_notice', coalesce(s.privacy_notice, ''),
    'retention_days', coalesce(s.retention_days, 90));
end $$;

create or replace function public.visit_pass(p_token text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare v public.visits; s public.visitor_settings;
begin
  select * into v from public.visits where pass_token_hash = public.token_hash(p_token);
  if not found or v.personal_data_deleted_at is not null then return null; end if;
  select * into s from public.visitor_settings where org_id = v.org_id;
  return jsonb_build_object('name', v.visitor_name, 'code', v.code, 'status', v.status, 'expected_at', v.expected_at,
    'signed_in_at', v.signed_in_at, 'arrived_at', v.arrived_at, 'purpose', v.purpose, 'walk_in', v.walk_in,
    'phone', v.visitor_phone, 'company', v.visitor_company, 'reason', v.reason, 'host_hint', v.host_hint,
    'org', (select o.name from public.organizations o where o.id = v.org_id),
    'brand', public.org_brand(v.org_id),
    'timezone', (select o.timezone from public.organizations o where o.id = v.org_id),
    'location', (select jsonb_build_object('name', l.name, 'address', l.address, 'lat', l.lat, 'lng', l.lng) from public.locations l where l.id = v.location_id),
    'host', (select coalesce(m.full_name, split_part(m.email, '@', 1)) from public.members m where m.id = v.host_member_id),
    'rules_text', coalesce(s.rules_text, 'By signing in you agree to follow our safety rules, wear your visitor badge, and stay with your host.'),
    'privacy_notice', coalesce(s.privacy_notice, ''),
    'retention_days', coalesce(s.retention_days, 90));
end $$;

commit;
