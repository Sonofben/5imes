-- 5ime: show website prices in US dollars, euros and pounds for visitors outside Nigeria.
-- Prices are set in naira; Global Admin keeps the conversion rate and a markup per currency.
-- Billing stays in naira for now. Apply after 0027.
begin;

create table if not exists public.platform_currencies (
  code          text primary key check (code ~ '^[A-Z]{3}$'),
  name          text not null,
  symbol        text not null check (length(symbol) between 1 and 4),
  ngn_per_unit  numeric(14,4) not null check (ngn_per_unit > 0),
  markup_pct    numeric(6,2) not null default 0 check (markup_pct between 0 and 500),
  active        boolean not null default true,
  sort          integer not null default 0,
  updated_at    timestamptz not null default now()
);
alter table public.platform_currencies enable row level security;
revoke all on public.platform_currencies from public, anon, authenticated;

-- Starting rates for display only; Global Admin should set current rates before launch.
insert into public.platform_currencies (code, name, symbol, ngn_per_unit, markup_pct, sort) values
  ('NGN', 'Nigerian naira', '₦', 1, 0, 0),
  ('USD', 'US dollar', '$', 1500, 0, 1),
  ('EUR', 'Euro', '€', 1700, 0, 2),
  ('GBP', 'British pound', '£', 1950, 0, 3)
on conflict (code) do nothing;

create or replace function public.public_currencies()
returns jsonb language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'symbol', symbol,
           'ngnPerUnit', ngn_per_unit, 'markupPct', markup_pct) order by sort), '[]'::jsonb)
    from public.platform_currencies where active
$$;
revoke all on function public.public_currencies() from public;
grant execute on function public.public_currencies() to anon, authenticated, service_role;

create or replace function public.console_currencies()
returns setof public.platform_currencies language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','finance','viewer']);
  return query select * from public.platform_currencies order by sort;
end $$;
revoke all on function public.console_currencies() from public, anon;
grant execute on function public.console_currencies() to authenticated;

create or replace function public.console_set_currency(p_code text, p_ngn_per_unit numeric, p_markup_pct numeric, p_active boolean, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','finance'], p_reason, true);
  if p_code = 'NGN' then raise exception 'Naira prices are set on the plans themselves.'; end if;
  if p_ngn_per_unit is null or p_ngn_per_unit <= 0 or p_ngn_per_unit > 1000000 then raise exception 'Enter a valid rate.'; end if;
  if p_markup_pct is null or p_markup_pct < 0 or p_markup_pct > 500 then raise exception 'Markup must be between 0 and 500 percent.'; end if;
  update public.platform_currencies set ngn_per_unit = p_ngn_per_unit, markup_pct = p_markup_pct, active = coalesce(p_active, true), updated_at = now()
   where code = p_code;
  if not found then raise exception 'Unknown currency.'; end if;
  perform public.console_log(null, 'pricing.currency', p_reason,
    jsonb_build_object('code', p_code, 'ngn_per_unit', p_ngn_per_unit, 'markup_pct', p_markup_pct, 'active', p_active));
end $$;
revoke all on function public.console_set_currency(text, numeric, numeric, boolean, text) from public, anon;
grant execute on function public.console_set_currency(text, numeric, numeric, boolean, text) to authenticated;

commit;
