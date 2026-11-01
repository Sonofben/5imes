-- 5ime: flexible pricing for one company, set in Global Admin. A deal is a percentage off,
-- an amount off each payment, or a custom price per staff member, for one plan or any plan,
-- for a number of months and/or payments. When it ends, normal prices apply again.
-- Apply after 0028.
begin;

create table if not exists public.price_deals (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  kind            text not null check (kind in ('percent','amount','custom_price')),
  percent_off     numeric(5,2) check (percent_off is null or (percent_off > 0 and percent_off <= 100)),
  amount_off_kobo bigint check (amount_off_kobo is null or amount_off_kobo > 0),
  price_per_seat  integer check (price_per_seat is null or price_per_seat between 0 and 1000000),
  plan            text check (plan is null or plan in ('basic','pro','premium')),
  starts_at       timestamptz not null default now(),
  ends_at         timestamptz,
  max_uses        integer check (max_uses is null or max_uses between 1 and 1000),
  uses            integer not null default 0,
  note            text check (note is null or length(note) <= 300),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  check ((kind = 'percent' and percent_off is not null and amount_off_kobo is null and price_per_seat is null)
      or (kind = 'amount' and amount_off_kobo is not null and percent_off is null and price_per_seat is null)
      or (kind = 'custom_price' and price_per_seat is not null and percent_off is null and amount_off_kobo is null)),
  check (ends_at is null or ends_at > starts_at)
);
create index if not exists price_deals_org_idx on public.price_deals (org_id, created_at desc);
alter table public.price_deals enable row level security;
revoke all on public.price_deals from public, anon, authenticated;

alter table public.payments add column if not exists deal_id uuid references public.price_deals(id) on delete set null;
alter table public.payments add column if not exists discount_kobo bigint not null default 0 check (discount_kobo >= 0);
-- The amount Paystack was last told to charge for automatic renewal.
alter table public.subscriptions add column if not exists paystack_amount_kobo bigint;

-- The deal that applies to a company right now for a plan (null plan on the deal means any plan).
create or replace function public.active_deal(p_org uuid, p_plan text, p_at timestamptz default now())
returns public.price_deals language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select d.* from public.price_deals d
   where d.org_id = p_org and d.revoked_at is null and d.starts_at <= p_at
     and (d.ends_at is null or d.ends_at > p_at)
     and (d.max_uses is null or d.uses < d.max_uses)
     and (d.plan is null or d.plan = p_plan)
   order by d.created_at desc limit 1
$$;
revoke all on function public.active_deal(uuid, text, timestamptz) from public, anon, authenticated;

/** Price per staff member a month for this company and plan, after a custom price deal. */
create or replace function public.org_seat_price(p_org uuid, p_plan text)
returns integer language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare d public.price_deals;
begin
  d := public.active_deal(p_org, p_plan);
  if d.id is not null and d.kind = 'custom_price' then return d.price_per_seat; end if;
  return public.plan_price(p_plan);
end $$;
revoke all on function public.org_seat_price(uuid, text) from public, anon, authenticated;

/** A plan payment for this company: the full price, the discount and the deal used. */
create or replace function public.org_term_quote(p_org uuid, p_plan text, p_seats integer, p_months integer, p_field integer default 0)
returns table (gross_kobo bigint, discount_kobo bigint, total_kobo bigint, deal_id uuid)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare d public.price_deals; v_gross bigint; v_disc bigint := 0;
begin
  d := public.active_deal(p_org, p_plan);
  v_gross := p_seats::bigint * public.org_seat_price(p_org, p_plan) * p_months * 100
           + public.field_addon_kobo(p_plan, coalesce(p_field, 0), p_months);
  if d.id is not null and d.kind = 'percent' then v_disc := round(v_gross * d.percent_off / 100.0)::bigint;
  elsif d.id is not null and d.kind = 'amount' then v_disc := d.amount_off_kobo;
  end if;
  -- Never charge less than ₦100: Paystack needs an amount, and a free term is a complimentary grant instead.
  v_disc := greatest(0, least(v_disc, v_gross - 10000));
  return query select v_gross, v_disc, v_gross - v_disc, d.id;
end $$;
revoke all on function public.org_term_quote(uuid, text, integer, integer, integer) from public, anon, authenticated;

-- What the next automatic renewal should charge, with any deal.
create or replace function public.renewal_amount_kobo(p_org uuid)
returns bigint language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select q.total_kobo from public.subscriptions s join public.organizations o on o.id = s.org_id,
    lateral public.org_term_quote(s.org_id, s.plan, s.seats_paid, s.billing_interval_months,
      case when s.plan = 'pro' then o.field_addon_seats else 0 end) q
   where s.org_id = p_org
$$;
revoke all on function public.renewal_amount_kobo(uuid) from public, anon, authenticated;
grant execute on function public.renewal_amount_kobo(uuid) to service_role;

-- Company admins see their own prices and deal on the Billing page.
create or replace function public.my_pricing()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); r jsonb := '{}'::jsonb; p text; d public.price_deals;
begin
  if v_org is null or not public.is_org_admin() then return null; end if;
  foreach p in array array['basic','pro','premium'] loop
    d := public.active_deal(v_org, p);
    r := r || jsonb_build_object(p, jsonb_build_object(
      'pricePerSeat', public.org_seat_price(v_org, p),
      'listPrice', public.plan_price(p),
      'percentOff', case when d.kind = 'percent' then d.percent_off end,
      'amountOffKobo', case when d.kind = 'amount' then d.amount_off_kobo end,
      'endsAt', d.ends_at,
      'usesLeft', case when d.max_uses is not null then d.max_uses - d.uses end,
      'hasDeal', d.id is not null));
  end loop;
  return r;
end $$;
revoke all on function public.my_pricing() from public, anon;
grant execute on function public.my_pricing() to authenticated;

-- ───────────────────────────────────────────── checkout uses the deal
create or replace function public.prepare_paystack_subscription(p_reference text, p_plan text, p_seats integer, p_months integer,
  p_auto_renew boolean default false, p_field_seats integer default 0)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_sub public.subscriptions%rowtype; v_used integer; v_field_used integer;
  v_now timestamptz := clock_timestamp(); v_term_running boolean; v_field integer := coalesce(p_field_seats, 0);
  q record;
begin
  perform public.rate_limit_hit('payment_start', 'o:' || public.my_org_id(), 20, interval '1 hour');
  if auth.uid() is null or not public.is_org_admin() or v_org is null then raise exception 'Only this company''s admins can change billing.'; end if;
  if p_reference is null or p_reference !~ '^[-A-Za-z0-9.=]{1,100}$'
    or p_plan is null or p_plan not in ('basic','pro','premium') or p_seats is null or p_seats < 1 or p_seats > 10000
    or p_months is null or p_months not in (1,3,6,12) or p_auto_renew is null or v_field < 0 or v_field > 10000 then
    raise exception 'Subscription checkout details are invalid.';
  end if;
  if p_plan = 'basic' and v_field > 0 then raise exception 'The field staff add-on is for Pro. Premium includes field staff.'; end if;
  if p_plan = 'premium' then v_field := 0; end if;
  if v_field > p_seats then raise exception 'Field staff places cannot be more than paid seats.'; end if;
  select * into v_sub from public.subscriptions where org_id=v_org for update;
  if not found then raise exception 'Subscription record was not found.'; end if;

  if v_sub.paystack_subscription_code is not null and not v_sub.cancel_at_period_end then
    raise exception 'Automatic renewal is on, so Paystack will charge the next term. Turn automatic renewal off to pay manually.';
  end if;
  v_term_running := v_sub.status in ('active','past_due') and v_sub.current_period_end > v_now;
  if v_term_running and p_plan <> v_sub.plan then
    raise exception 'Your current paid term is on the % plan. Pay ahead on the same plan, or switch plans when this term ends.', initcap(v_sub.plan);
  end if;
  if v_term_running and p_auto_renew then
    raise exception 'Automatic renewal can be switched on when the current paid term ends. Pay ahead manually for now.';
  end if;
  if exists(select 1 from public.payments where org_id=v_org and status='pending' and kind in ('seat_increase','field_addon')) then
    raise exception 'A seat or field staff payment is still unresolved. Check that checkout before starting a new payment.';
  end if;
  if exists(select 1 from public.payments where org_id=v_org and status='pending' and kind='subscription') then
    raise exception 'A payment is already pending. Resume or check that payment before starting another.';
  end if;
  select count(*)::integer into v_used from public.members where org_id=v_org and status in ('active','invited');
  if p_seats<greatest(1,v_used) then raise exception 'The seat count cannot be below active and invited people.'; end if;
  if p_plan = 'pro' then
    select count(*)::integer into v_field_used from public.members where org_id=v_org and status='active' and is_field;
    if v_field < v_field_used then
      raise exception 'You have % field staff. Choose at least % field staff places, or turn field staff off for some people first.', v_field_used, v_field_used;
    end if;
  end if;
  select * into q from public.org_term_quote(v_org, p_plan, p_seats, p_months, v_field);
  insert into public.payments(reference,org_id,plan,seats,billing_interval_months,amount_kobo,currency,status,kind,field_seats,deal_id,discount_kobo)
    values(p_reference,v_org,p_plan,p_seats,p_months,q.total_kobo,'NGN','pending','subscription',v_field,q.deal_id,q.discount_kobo);
  return jsonb_build_object('ok',true,'reference',p_reference,'amount_kobo',q.total_kobo,'discount_kobo',q.discount_kobo,'seats',p_seats,'months',p_months,
    'auto_renew',p_auto_renew,'field_seats',v_field);
end $$;
revoke all on function public.prepare_paystack_subscription(text, text, integer, integer, boolean, integer) from public, anon;
grant execute on function public.prepare_paystack_subscription(text, text, integer, integer, boolean, integer) to authenticated;

-- Seat top-ups use the company's custom seat price when it has one.
do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.prepare_paystack_seat_increase(text, integer)'::regprocedure);
  v_new := replace(v_def, 'v_price := public.plan_price(v_sub.plan);', 'v_price := public.org_seat_price(v_org, v_sub.plan);');
  if v_new = v_def then raise exception 'prepare_paystack_seat_increase: expected text not found'; end if;
  execute v_new;

  -- Renewals: also accept the amount Paystack was last told, while a new amount is still being sent to Paystack.
  v_def := pg_get_functiondef('public.apply_paystack_payment(text, text, bigint, text, text, text, text, text)'::regprocedure);
  v_new := replace(v_def, $q$  if p_amount_kobo <> v_expected then$q$,
    $q$  if not v_known and p_amount_kobo <> v_expected and p_amount_kobo = (select paystack_amount_kobo from public.subscriptions where org_id = v_org) then
    v_expected := p_amount_kobo;
  end if;
  if p_amount_kobo <> v_expected then$q$);
  if v_new = v_def then raise exception 'apply_paystack_payment: amount check not found'; end if;
  v_def := v_new;
  -- Count a deal as used once its payment is applied.
  v_new := replace(v_def, $q$  update public.payments set status = 'applied', applied_at = now(), paystack_customer = p_customer_code,$q$,
    $q$  if v_known and v_payment.deal_id is not null then
    update public.price_deals set uses = uses + 1 where id = v_payment.deal_id;
  elsif not v_known then
    update public.price_deals set uses = uses + 1 where id = (public.active_deal(v_org, v_plan)).id;
  end if;
  update public.payments set status = 'applied', applied_at = now(), paystack_customer = p_customer_code,$q$);
  if v_new = v_def then raise exception 'apply_paystack_payment: applied update not found'; end if;
  execute v_new;
end $$;

-- Automatic renewals whose Paystack amount needs updating (a deal started or ended, or seats changed).
create or replace function public.renewals_needing_price_sync()
returns table (org_id uuid, plan_code text, amount_kobo bigint)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select s.org_id, s.paystack_plan_code, public.renewal_amount_kobo(s.org_id)
    from public.subscriptions s
   where s.paystack_plan_code is not null and s.paystack_subscription_code is not null and not s.cancel_at_period_end
     and s.status in ('active','past_due')
     and coalesce(s.paystack_amount_kobo, -1) <> public.renewal_amount_kobo(s.org_id)
$$;
revoke all on function public.renewals_needing_price_sync() from public, anon, authenticated;
grant execute on function public.renewals_needing_price_sync() to service_role;

create or replace function public.mark_renewal_price_synced(p_org uuid, p_amount_kobo bigint)
returns void language sql security definer set search_path = pg_catalog, public, pg_temp as $$
  update public.subscriptions set paystack_amount_kobo = p_amount_kobo where org_id = p_org
$$;
revoke all on function public.mark_renewal_price_synced(uuid, bigint) from public, anon, authenticated;
grant execute on function public.mark_renewal_price_synced(uuid, bigint) to service_role;

-- ───────────────────────────────────────────── Global Admin
create or replace function public.console_set_deal(p_org uuid, p_kind text, p_value numeric, p_plan text, p_months integer, p_payments integer,
  p_note text, p_reason text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_id uuid; v_plan text := nullif(p_plan, '');
begin
  perform public.console_require(array['owner','finance'], p_reason, true);
  if not exists (select 1 from public.organizations where id = p_org) then raise exception 'Company not found.'; end if;
  if p_kind not in ('percent','amount','custom_price') then raise exception 'Choose a deal type.'; end if;
  if v_plan is not null and v_plan not in ('basic','pro','premium') then raise exception 'Choose a plan.'; end if;
  if p_value is null or p_value <= 0 then raise exception 'Enter a value above zero.'; end if;
  if p_kind = 'percent' and p_value > 100 then raise exception 'A percentage can be at most 100.'; end if;
  if p_kind = 'custom_price' and (p_value <> trunc(p_value) or p_value > 1000000) then raise exception 'Enter the custom price in whole naira.'; end if;
  if p_months is not null and (p_months < 1 or p_months > 120) then raise exception 'Months must be between 1 and 120.'; end if;
  if p_payments is not null and (p_payments < 1 or p_payments > 1000) then raise exception 'Payments must be between 1 and 1,000.'; end if;
  -- One deal at a time: a new deal replaces the current one.
  update public.price_deals set revoked_at = now() where org_id = p_org and revoked_at is null;
  insert into public.price_deals (org_id, kind, percent_off, amount_off_kobo, price_per_seat, plan, ends_at, max_uses, note, created_by)
  values (p_org, p_kind,
          case when p_kind = 'percent' then p_value end,
          case when p_kind = 'amount' then round(p_value * 100)::bigint end,
          case when p_kind = 'custom_price' then p_value::integer end,
          v_plan, case when p_months is not null then now() + make_interval(months => p_months) end, p_payments,
          nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  perform public.console_log(p_org, 'billing.deal_set', p_reason,
    jsonb_build_object('deal', v_id, 'kind', p_kind, 'value', p_value, 'plan', v_plan, 'months', p_months, 'payments', p_payments));
  return v_id;
end $$;
revoke all on function public.console_set_deal(uuid, text, numeric, text, integer, integer, text, text) from public, anon;
grant execute on function public.console_set_deal(uuid, text, numeric, text, integer, integer, text, text) to authenticated;

create or replace function public.console_end_deal(p_org uuid, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','finance'], p_reason, true);
  update public.price_deals set revoked_at = now() where org_id = p_org and revoked_at is null;
  if not found then raise exception 'This company has no deal to end.'; end if;
  perform public.console_log(p_org, 'billing.deal_end', p_reason, '{}'::jsonb);
end $$;
revoke all on function public.console_end_deal(uuid, text) from public, anon;
grant execute on function public.console_end_deal(uuid, text) to authenticated;

create or replace function public.console_deals(p_org uuid default null)
returns table (id uuid, org_id uuid, org_name text, kind text, percent_off numeric, amount_off_kobo bigint, price_per_seat integer, plan text,
               starts_at timestamptz, ends_at timestamptz, max_uses integer, uses integer, note text, created_at timestamptz,
               revoked_at timestamptz, is_active boolean)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','finance','viewer']);
  return query
    select d.id, d.org_id, o.name, d.kind, d.percent_off, d.amount_off_kobo, d.price_per_seat, d.plan, d.starts_at, d.ends_at, d.max_uses, d.uses,
           d.note, d.created_at, d.revoked_at,
           (d.revoked_at is null and d.starts_at <= now() and (d.ends_at is null or d.ends_at > now()) and (d.max_uses is null or d.uses < d.max_uses))
      from public.price_deals d join public.organizations o on o.id = d.org_id
     where p_org is null or d.org_id = p_org
     order by d.created_at desc limit 500;
end $$;
revoke all on function public.console_deals(uuid) from public, anon;
grant execute on function public.console_deals(uuid) to authenticated;

commit;
