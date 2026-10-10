-- 5ime: record payments received by direct bank transfer (no payment gateway needed).
-- Run by Kora Forge staff in the Supabase SQL Editor after confirming the money arrived:
--
--   select record_bank_transfer('acme.ng', 'basic', 10, 3, 7500, 'FBN-123456');      -- new / next term
--   select record_bank_transfer_seats('acme.ng', 12, 1500, 'FBN-123999');            -- add seats mid-term
--
-- The amount must match exactly: seats × ₦250 (Basic) / ₦500 (Pro) × months.
-- Uses the same ledger as Paystack, so receipts, history and pay-ahead rules all work.
-- Apply after 0005.
begin;

create or replace function public.record_bank_transfer(
  p_domain text, p_plan text, p_seats integer, p_months integer, p_amount_naira numeric, p_bank_reference text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid; v_sub public.subscriptions%rowtype; v_ref text; v_expected bigint; v_used integer;
begin
  select id into v_org from public.organizations where domain = lower(trim(p_domain));
  if v_org is null then raise exception 'No company uses the email domain %.', p_domain; end if;
  if p_plan not in ('basic','pro') or p_months not in (1,3,6,12) or p_seats is null or p_seats < 1 or p_seats > 10000 then
    raise exception 'Use plan basic or pro, 1/3/6/12 months and at least 1 seat.';
  end if;
  if coalesce(trim(p_bank_reference), '') = '' then raise exception 'Enter the bank transfer reference.'; end if;
  select * into v_sub from public.subscriptions where org_id = v_org for update;
  if v_sub.paystack_subscription_code is not null and not v_sub.cancel_at_period_end then
    raise exception 'This company has automatic card renewal on. Turn it off on their Billing page before recording a transfer.';
  end if;
  if v_sub.status in ('active','past_due') and v_sub.current_period_end > now() and p_plan <> v_sub.plan then
    raise exception 'Their current paid term is on the % plan. Record the same plan, or switch when the term ends.', v_sub.plan;
  end if;
  select count(*)::integer into v_used from public.members where org_id = v_org and status in ('active','invited');
  if p_seats < v_used then raise exception 'They have % active/invited people; record at least that many seats.', v_used; end if;
  v_expected := p_seats::bigint * (case p_plan when 'basic' then 250 else 500 end) * p_months * 100;
  if round(p_amount_naira * 100) <> v_expected then
    raise exception 'Amount should be ₦% for % seats × % months on %.', v_expected / 100, p_seats, p_months, p_plan;
  end if;
  v_ref := 'bank-' || left(regexp_replace(p_bank_reference, '[^A-Za-z0-9]', '', 'g'), 80);
  if exists (select 1 from public.payments where reference = v_ref) then
    raise exception 'Bank reference % has already been recorded.', p_bank_reference;
  end if;
  if exists (select 1 from public.payments where org_id = v_org and status = 'pending') then
    raise exception 'This company has a pending online checkout. Resolve it on their Billing page first.';
  end if;
  insert into public.payments(reference, org_id, plan, seats, billing_interval_months, amount_kobo, currency, status, kind)
    values (v_ref, v_org, p_plan, p_seats, p_months, v_expected, 'NGN', 'pending', 'subscription');
  return public.apply_paystack_payment(v_ref, 'success', v_expected, 'NGN');
end $$;

create or replace function public.record_bank_transfer_seats(
  p_domain text, p_new_total_seats integer, p_amount_naira numeric, p_bank_reference text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid; v_sub public.subscriptions%rowtype; v_ref text; v_expected bigint;
begin
  select id into v_org from public.organizations where domain = lower(trim(p_domain));
  if v_org is null then raise exception 'No company uses the email domain %.', p_domain; end if;
  if coalesce(trim(p_bank_reference), '') = '' then raise exception 'Enter the bank transfer reference.'; end if;
  select * into v_sub from public.subscriptions where org_id = v_org for update;
  if v_sub.status <> 'active' or v_sub.current_period_end is null or v_sub.current_period_end <= now() then
    raise exception 'They need an active paid term before adding seats.';
  end if;
  if p_new_total_seats is null or p_new_total_seats <= v_sub.seats_paid then
    raise exception 'New total must be more than their current % paid seats.', v_sub.seats_paid;
  end if;
  v_expected := (p_new_total_seats - v_sub.seats_paid)::bigint * (case v_sub.plan when 'basic' then 250 else 500 end)
                * v_sub.billing_interval_months * 100;
  if round(p_amount_naira * 100) <> v_expected then
    raise exception 'Amount should be ₦% for % added seats × % months.', v_expected / 100, p_new_total_seats - v_sub.seats_paid, v_sub.billing_interval_months;
  end if;
  v_ref := 'bank-' || left(regexp_replace(p_bank_reference, '[^A-Za-z0-9]', '', 'g'), 80);
  if exists (select 1 from public.payments where reference = v_ref) then
    raise exception 'Bank reference % has already been recorded.', p_bank_reference;
  end if;
  if exists (select 1 from public.payments where org_id = v_org and status = 'pending') then
    raise exception 'This company has a pending online checkout. Resolve it on their Billing page first.';
  end if;
  insert into public.payments(reference, org_id, plan, seats, billing_interval_months, amount_kobo, currency, status, kind, paystack_plan_code)
    values (v_ref, v_org, v_sub.plan, p_new_total_seats, v_sub.billing_interval_months, v_expected, 'NGN', 'pending', 'seat_increase', v_sub.paystack_plan_code);
  return public.apply_paystack_payment(v_ref, 'success', v_expected, 'NGN');
end $$;

-- Staff-only: never callable from the app or by company admins.
revoke all on function public.record_bank_transfer(text,text,integer,integer,numeric,text) from public, anon, authenticated;
revoke all on function public.record_bank_transfer_seats(text,integer,numeric,text) from public, anon, authenticated;
grant execute on function public.record_bank_transfer(text,text,integer,integer,numeric,text) to service_role;
grant execute on function public.record_bank_transfer_seats(text,integer,numeric,text) to service_role;

commit;
