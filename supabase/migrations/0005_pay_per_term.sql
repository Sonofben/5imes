-- 5ime: pay per term by default; automatic card renewal is an opt-in choice.
--  * Manual (default) payments: one-off Paystack charge for 1/3/6/12 months. Paying again
--    before the term ends books the next term starting at the current end date (or trial end).
--  * Auto-renew (opt-in): Paystack plan + subscription, as before. Only offered when no
--    paid term is running, so provider and local renewal dates stay aligned.
--  * Seat top-ups no longer require an auto-renew subscription.
-- Apply after 0004.
begin;

drop function if exists public.prepare_paystack_subscription(text, text, integer, integer);

create or replace function public.prepare_paystack_subscription(
  p_reference text, p_plan text, p_seats integer, p_months integer, p_auto_renew boolean default false
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_sub public.subscriptions%rowtype; v_used integer;
  v_now timestamptz := clock_timestamp(); v_price integer; v_amount bigint; v_term_running boolean;
begin
  if auth.uid() is null or not public.is_org_admin() or v_org is null then raise exception 'Only this company''s admins can change billing.'; end if;
  if p_reference is null or p_reference !~ '^[-A-Za-z0-9.=]{1,100}$'
    or p_plan is null or p_plan not in ('basic','pro') or p_seats is null or p_seats < 1 or p_seats > 10000
    or p_months is null or p_months not in (1,3,6,12) or p_auto_renew is null then
    raise exception 'Subscription checkout details are invalid.';
  end if;
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
  if exists(select 1 from public.payments where org_id=v_org and status='pending' and kind='seat_increase') then
    raise exception 'A seat payment is still unresolved. Check that checkout before starting a new payment.';
  end if;
  if exists(select 1 from public.payments where org_id=v_org and status='pending' and kind='subscription') then
    raise exception 'A payment is already pending. Resume or check that payment before starting another.';
  end if;
  select count(*)::integer into v_used from public.members where org_id=v_org and status in ('active','invited');
  if p_seats<greatest(1,v_used) then raise exception 'The seat count cannot be below active and invited people.'; end if;
  v_price := case p_plan when 'basic' then 250 else 500 end;
  v_amount := p_seats::bigint*v_price*p_months*100;
  insert into public.payments(reference,org_id,plan,seats,billing_interval_months,amount_kobo,currency,status,kind)
    values(p_reference,v_org,p_plan,p_seats,p_months,v_amount,'NGN','pending','subscription');
  return jsonb_build_object('ok',true,'reference',p_reference,'amount_kobo',v_amount,'seats',p_seats,'months',p_months,'auto_renew',p_auto_renew);
end $$;

-- Seat top-ups: any active paid term (manual or auto-renew) can add prorated seats.
create or replace function public.prepare_paystack_seat_increase(p_reference text, p_seats integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_sub public.subscriptions%rowtype; v_used integer;
  v_now timestamptz := clock_timestamp(); v_duration numeric; v_remaining numeric;
  v_amount bigint; v_price integer;
begin
  if auth.uid() is null or not public.is_org_admin() or v_org is null then raise exception 'Only this company''s admins can add seats.'; end if;
  if p_reference is null or p_reference !~ '^[-A-Za-z0-9.=]{1,100}$' or p_seats is null or p_seats < 1 or p_seats > 10000 then
    raise exception 'Seat checkout details are invalid.';
  end if;
  select * into v_sub from public.subscriptions where org_id=v_org for update;
  if not found or v_sub.status<>'active' or v_sub.current_period_start is null
    or v_sub.current_period_end is null or v_sub.current_period_end<=v_now then
    raise exception 'An active paid term is required to add prorated seats.';
  end if;
  if p_seats<=v_sub.seats_paid then raise exception 'Choose more seats than the current paid limit.'; end if;
  select count(*)::integer into v_used from public.members where org_id=v_org and status in ('active','invited');
  if p_seats<v_used then raise exception 'Seat capacity cannot be below active and invited members.'; end if;
  if exists(select 1 from public.payments where org_id=v_org and kind='subscription' and status='pending') then
    raise exception 'A payment is pending. Resolve that checkout before changing seat capacity.';
  end if;
  if exists(select 1 from public.payments where org_id=v_org and kind='seat_increase' and status='pending') then
    raise exception 'A seat-increase payment is already pending. Complete it or check its status before starting another.';
  end if;
  -- Prorate over the paid time still ahead (a pay-ahead term counts too).
  v_duration := extract(epoch from (v_sub.current_period_end-v_sub.current_period_start));
  v_remaining := extract(epoch from (v_sub.current_period_end-greatest(v_now, v_sub.current_period_start)));
  if v_duration<=0 or v_remaining<=0 then raise exception 'The current billing period cannot be prorated.'; end if;
  v_price := case v_sub.plan when 'basic' then 250 else 500 end;
  v_amount := greatest(1,round((p_seats-v_sub.seats_paid)::numeric*v_price*v_sub.billing_interval_months*100*v_remaining/v_duration)::bigint);
  insert into public.payments(reference,org_id,plan,seats,billing_interval_months,amount_kobo,currency,status,kind,paystack_plan_code)
    values(p_reference,v_org,v_sub.plan,p_seats,v_sub.billing_interval_months,v_amount,'NGN','pending','seat_increase',v_sub.paystack_plan_code);
  return jsonb_build_object('ok',true,'reference',p_reference,'amount_kobo',v_amount,'added_seats',p_seats-v_sub.seats_paid);
end $$;

create or replace function public.apply_paystack_payment(
  p_reference text, p_status text, p_amount_kobo bigint, p_currency text,
  p_customer_code text default null, p_subscription_code text default null,
  p_plan_code text default null, p_email_token text default null
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_payment public.payments%rowtype; v_sub public.subscriptions%rowtype;
  v_org uuid; v_plan text; v_seats integer; v_months integer; v_expected bigint;
  v_base timestamptz; v_inserted integer; v_claim_status text; v_kind text := 'subscription';
  v_manual boolean := false;
begin
  if p_status <> 'success' then
    if p_status in ('failed','abandoned','reversed') then
      update public.payments set status = 'failed' where reference = p_reference and status = 'pending';
    end if;
    return jsonb_build_object('ok', false, 'reason', 'payment not successful');
  end if;
  if coalesce(p_currency,'') <> 'NGN' or p_amount_kobo is null or p_amount_kobo < 1 then
    return jsonb_build_object('ok', false, 'reason', 'currency or amount invalid');
  end if;

  select * into v_payment from public.payments where reference = p_reference for update;
  if found then
    if v_payment.status = 'applied' then return jsonb_build_object('ok', true, 'reason', 'already applied'); end if;
    if v_payment.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'payment reference is not pending'); end if;
    v_org := v_payment.org_id; v_plan := v_payment.plan; v_seats := v_payment.seats; v_months := v_payment.billing_interval_months;
    v_kind := v_payment.kind;
    v_expected := v_payment.amount_kobo;
    -- A checkout this app created without a Paystack plan is a one-off (manual) term payment.
    v_manual := v_payment.kind = 'subscription' and v_payment.paystack_plan_code is null and p_plan_code is null;
  else
    -- Unknown reference: only an automatic renewal charge for a known subscription is accepted.
    select * into v_sub from public.subscriptions s
      where (p_subscription_code is not null and s.paystack_subscription_code = p_subscription_code)
         or (p_plan_code is not null and s.paystack_plan_code = p_plan_code)
      order by case when s.paystack_subscription_code = p_subscription_code then 0 else 1 end
      limit 1 for update;
    if not found then return jsonb_build_object('ok', false, 'reason', 'no matching pending payment or subscription'); end if;
    v_org := v_sub.org_id; v_plan := v_sub.plan; v_seats := v_sub.seats_paid; v_months := v_sub.billing_interval_months;
    v_expected := v_seats * (case v_plan when 'basic' then 250 else 500 end)::bigint * v_months * 100;
  end if;

  if p_amount_kobo <> v_expected then
    update public.payments set status = 'failed' where reference = p_reference and status = 'pending';
    return jsonb_build_object('ok', false, 'reason', 'verified amount does not match the expected charge');
  end if;
  if v_seats < 1 or v_months not in (1,3,6,12) then return jsonb_build_object('ok', false, 'reason', 'subscription details invalid'); end if;
  if v_payment.reference is not null and v_payment.kind='subscription' and v_payment.amount_kobo <>
    v_payment.seats * (case v_payment.plan when 'basic' then 250 else 500 end)::bigint * v_payment.billing_interval_months * 100 then
    return jsonb_build_object('ok', false, 'reason', 'checkout amount does not match current pricing');
  end if;

  select * into v_sub from public.subscriptions where org_id = v_org for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'subscription not found'); end if;
  if v_kind='seat_increase' then
    if v_sub.status not in ('active','past_due')
      or v_sub.paystack_plan_code is distinct from v_payment.paystack_plan_code
      or v_sub.plan is distinct from v_payment.plan or v_sub.billing_interval_months<>v_payment.billing_interval_months then
      return jsonb_build_object('ok',false,'reason','subscription changed while the seat payment was pending');
    end if;
    if v_seats<=v_sub.seats_paid or v_seats<(select count(*) from public.members where org_id=v_org and status in ('active','invited')) then
      return jsonb_build_object('ok',false,'reason','seat increase is no longer valid');
    end if;
    update public.subscriptions set seats_paid=v_seats,updated_at=now() where org_id=v_org;
    update public.payments set status='applied',applied_at=now(),
        renewal_sync_status=case when v_payment.paystack_plan_code is null then 'not_required' else 'pending' end,
        renewal_sync_error=null
      where reference=p_reference and status='pending';
    return jsonb_build_object('ok',true,
      'reason',case when v_payment.paystack_plan_code is null then 'prorated seats applied' else 'prorated seats applied; renewal price sync pending' end,
      'kind','seat_increase','seats',v_seats);
  end if;

  if v_payment.reference is null then
    insert into public.payments(reference,org_id,plan,seats,billing_interval_months,amount_kobo,currency,status,
      paystack_customer,paystack_plan_code,paystack_subscription_code)
    values(p_reference,v_org,v_plan,v_seats,v_months,p_amount_kobo,'NGN','pending',p_customer_code,p_plan_code,p_subscription_code)
    on conflict (reference) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      select status into v_claim_status from public.payments where reference=p_reference;
      if v_claim_status='applied' then return jsonb_build_object('ok',true,'reason','already applied'); end if;
      return jsonb_build_object('ok',false,'reason','payment reference is already being processed');
    end if;
    v_payment.reference := p_reference;
  end if;

  if v_manual then
    -- Pay-per-term. Paying ahead adds a new term right after the current paid term (or after
    -- the trial); seats increase immediately and never drop below what is already paid.
    if v_sub.status in ('active','past_due') and v_sub.current_period_end > now() then
      v_base := v_sub.current_period_end;
    elsif v_sub.status = 'trialing' and v_sub.trial_ends_at > now() then
      v_base := v_sub.trial_ends_at;
    else
      v_base := now();
    end if;
    update public.subscriptions set
      plan = v_plan, status = 'active',
      seats_paid = case when v_sub.status in ('active','past_due') and v_sub.current_period_end > now()
                        then greatest(v_seats, v_sub.seats_paid) else v_seats end,
      billing_interval_months = v_months,
      current_period_start = v_base,
      current_period_end = v_base + make_interval(months => v_months),
      paystack_customer = coalesce(p_customer_code, v_sub.paystack_customer),
      paystack_subscription_code = null, paystack_plan_code = null, cancel_at_period_end = false,
      last_reference = p_reference, updated_at = now()
    where org_id = v_org;
  else
    v_base := greatest(now(), coalesce(v_sub.current_period_end, now()));
    update public.subscriptions set
      plan = v_plan, status = 'active', seats_paid = v_seats, billing_interval_months = v_months,
      current_period_start = v_base, current_period_end = v_base + make_interval(months => v_months),
      paystack_customer = coalesce(p_customer_code, v_sub.paystack_customer),
      paystack_subscription_code = coalesce(p_subscription_code, v_sub.paystack_subscription_code),
      paystack_plan_code = coalesce(p_plan_code, v_sub.paystack_plan_code),
      cancel_at_period_end = false, last_reference = p_reference, updated_at = now()
    where org_id = v_org;
  end if;
  update public.payments set status = 'applied', applied_at = now(), paystack_customer = p_customer_code,
    paystack_subscription_code = coalesce(p_subscription_code, paystack_subscription_code)
  where reference = p_reference and status = 'pending';
  return jsonb_build_object('ok', true, 'reason', 'applied', 'manual', v_manual);
end $$;

revoke all on function public.prepare_paystack_subscription(text,text,integer,integer,boolean) from public, anon;
grant execute on function public.prepare_paystack_subscription(text,text,integer,integer,boolean) to authenticated;
revoke all on function public.apply_paystack_payment(text,text,bigint,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.apply_paystack_payment(text,text,bigint,text,text,text,text,text) to service_role;

commit;
