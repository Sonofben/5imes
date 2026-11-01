-- 5ime: company links move to /c/<link>, old links keep working forever, and a link that does not
-- match the company needs Global Admin approval. Field staff add-on for Pro is paid with Paystack.
-- Apply after 0024.
begin;

-- ───────────────────────────────────────────── company links
-- Every link a company has ever used. A link stays with its company forever, so an old link
-- keeps redirecting and can never be taken by another company (even after deletion).
create table if not exists public.org_slug_history (
  slug          text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  org_id        uuid references public.organizations(id) on delete set null,
  first_used_at timestamptz not null default now()
);
create index if not exists org_slug_history_org_idx on public.org_slug_history (org_id);
alter table public.org_slug_history enable row level security;
revoke all on public.org_slug_history from public, anon, authenticated;
insert into public.org_slug_history (slug, org_id) select slug, id from public.organizations on conflict do nothing;

-- Links now live under /c/, so page names no longer clash. Only names that could pass for
-- 5ime or Kora Forge staff stay blocked.
create or replace function public.reserved_slugs()
returns text[] language sql immutable as $$
  select array['5ime','fivetime','5imes','koraforge','kora-forge','support','help','official','security','billing','admin']
$$;

create or replace function public.unique_org_slug(p_name text)
returns text language plpgsql set search_path = pg_catalog, public, pg_temp as $$
declare v_base text; v_slug text; n int := 1;
begin
  v_base := trim(both '-' from regexp_replace(lower(coalesce(p_name, 'company')), '[^a-z0-9]+', '-', 'g'));
  v_base := trim(both '-' from left(v_base, 32));
  if length(v_base) < 3 then v_base := 'company'; end if;
  v_slug := v_base;
  while exists (select 1 from public.organizations where slug = v_slug)
     or exists (select 1 from public.org_slug_history where slug = v_slug)
     or v_slug = any (public.reserved_slugs()) loop
    n := n + 1; v_slug := v_base || '-' || n;
  end loop;
  return v_slug;
end $$;
revoke all on function public.unique_org_slug(text) from public, anon, authenticated;

create or replace function public.set_org_slug()
returns trigger language plpgsql set search_path = pg_catalog, public, pg_temp as $$
begin
  if new.slug is null or trim(new.slug) = '' then new.slug := public.unique_org_slug(new.name); end if;
  new.slug := lower(trim(new.slug));
  if tg_op = 'UPDATE' and new.slug = old.slug then return new; end if;
  if new.slug = any (public.reserved_slugs()) then raise exception 'That company link is reserved. Choose another.'; end if;
  if exists (select 1 from public.org_slug_history h where h.slug = new.slug and h.org_id is distinct from new.id) then
    raise exception 'That company link is already taken.';
  end if;
  return new;
end $$;

create or replace function public.remember_org_slug()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  insert into public.org_slug_history (slug, org_id) values (new.slug, new.id) on conflict (slug) do nothing;
  return null;
end $$;
revoke all on function public.remember_org_slug() from public, anon, authenticated;
drop trigger if exists organizations_slug_history on public.organizations;
create trigger organizations_slug_history after insert or update of slug on public.organizations
  for each row execute function public.remember_org_slug();

-- Admins change the link through request_company_link only.
revoke update (slug) on public.organizations from authenticated;

create table if not exists public.company_link_requests (
  org_id       uuid primary key references public.organizations(id) on delete cascade,
  slug         text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  requested_by uuid references public.members(id) on delete set null,
  requested_at timestamptz not null default now()
);
alter table public.company_link_requests enable row level security;
revoke all on public.company_link_requests from public, anon, authenticated;
grant select on public.company_link_requests to authenticated;
drop policy if exists company_link_requests_admin_read on public.company_link_requests;
create policy company_link_requests_admin_read on public.company_link_requests for select to authenticated
  using (org_id = public.my_org_id() and public.is_org_admin());

-- A link matches the company when it starts its name or email domain, contains the domain name
-- or a real word of the name, or is the initials of the name.
create or replace function public.slug_matches_org(p_org uuid, p_slug text)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_name text; v_dom text; s text; n text; d text; words text[]; v_init text;
begin
  select lower(o.name), lower(split_part(coalesce(o.domain, ''), '.', 1)) into v_name, v_dom from public.organizations o where o.id = p_org;
  if not found then return false; end if;
  s := regexp_replace(lower(coalesce(p_slug, '')), '[^a-z0-9]', '', 'g');
  if length(s) < 2 then return false; end if;
  n := regexp_replace(v_name, '[^a-z0-9]', '', 'g');
  d := regexp_replace(v_dom, '[^a-z0-9]', '', 'g');
  words := array(select w from unnest(regexp_split_to_array(trim(regexp_replace(v_name, '[^a-z0-9]+', ' ', 'g')), ' ')) w where w <> '');
  select string_agg(left(w, 1), '') into v_init from unnest(words) w;
  return left(n, length(s)) = s
      or (d <> '' and left(d, length(s)) = s)
      or (length(d) >= 3 and position(d in s) > 0)
      or exists (select 1 from unnest(words) w where length(w) >= 3
                   and w not in ('ltd','limited','the','and','plc','inc','llc','company','nigeria','group','services','global','international')
                   and position(w in s) > 0)
      or (coalesce(array_length(words, 1), 0) >= 2 and s = v_init);
end $$;
revoke all on function public.slug_matches_org(uuid, text) from public, anon;
grant execute on function public.slug_matches_org(uuid, text) to authenticated, service_role;

create or replace function public.request_company_link(p_slug text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_slug text := lower(trim(coalesce(p_slug, ''))); v_cur text;
begin
  if auth.uid() is null or v_org is null or not public.is_org_admin() then raise exception 'Only this company''s admins can change the company link.'; end if;
  perform public.rate_limit_hit('company_link', 'o:' || v_org, 10, interval '1 day');
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then raise exception 'Company link: 3 to 40 lowercase letters, numbers or dashes.'; end if;
  select slug into v_cur from public.organizations where id = v_org;
  if v_slug = v_cur then
    delete from public.company_link_requests where org_id = v_org;
    return jsonb_build_object('ok', true, 'status', 'unchanged', 'slug', v_cur);
  end if;
  if v_slug = any (public.reserved_slugs()) then raise exception 'That company link is reserved. Choose another.'; end if;
  if exists (select 1 from public.org_slug_history h where h.slug = v_slug and h.org_id is distinct from v_org) then
    raise exception 'That company link is already taken.';
  end if;
  -- One of the company's own old links, or a link that clearly matches the company: change now.
  if exists (select 1 from public.org_slug_history h where h.slug = v_slug and h.org_id = v_org) or public.slug_matches_org(v_org, v_slug) then
    update public.organizations set slug = v_slug where id = v_org;
    delete from public.company_link_requests where org_id = v_org;
    return jsonb_build_object('ok', true, 'status', 'changed', 'slug', v_slug);
  end if;
  insert into public.company_link_requests (org_id, slug, requested_by) values (v_org, v_slug, public.my_member_id())
    on conflict (org_id) do update set slug = excluded.slug, requested_by = excluded.requested_by, requested_at = now();
  return jsonb_build_object('ok', true, 'status', 'pending', 'slug', v_slug);
end $$;
revoke all on function public.request_company_link(text) from public, anon;
grant execute on function public.request_company_link(text) to authenticated;

create or replace function public.cancel_company_link_request()
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if auth.uid() is null or not public.is_org_admin() then raise exception 'Only this company''s admins can do this.'; end if;
  delete from public.company_link_requests where org_id = public.my_org_id();
end $$;
revoke all on function public.cancel_company_link_request() from public, anon;
grant execute on function public.cancel_company_link_request() to authenticated;

create or replace function public.console_company_link_requests()
returns table (org_id uuid, org_name text, domain text, current_slug text, slug text, requested_by_email text, requested_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support']);
  return query
    select r.org_id, o.name, o.domain, o.slug, r.slug, m.email, r.requested_at
      from public.company_link_requests r join public.organizations o on o.id = r.org_id
      left join public.members m on m.id = r.requested_by
     order by r.requested_at;
end $$;
revoke all on function public.console_company_link_requests() from public, anon;
grant execute on function public.console_company_link_requests() to authenticated;

create or replace function public.console_decide_company_link(p_org uuid, p_approve boolean, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare r public.company_link_requests%rowtype;
begin
  perform public.console_require(array['owner','support'], p_reason, true);
  select * into r from public.company_link_requests where org_id = p_org for update;
  if not found then raise exception 'That request is no longer waiting.'; end if;
  if coalesce(p_approve, false) then
    update public.organizations set slug = r.slug where id = p_org;
  end if;
  delete from public.company_link_requests where org_id = p_org;
  perform public.console_log(p_org, case when coalesce(p_approve, false) then 'company.link_approved' else 'company.link_declined' end,
    p_reason, jsonb_build_object('slug', r.slug));
end $$;
revoke all on function public.console_decide_company_link(uuid, boolean, text) from public, anon;
grant execute on function public.console_decide_company_link(uuid, boolean, text) to authenticated;

-- The current link for any link the company has used (old links redirect to it).
create or replace function public.resolve_company_link(p_slug text)
returns text language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select o.slug from public.org_slug_history h join public.organizations o on o.id = h.org_id
   where h.slug = lower(trim(p_slug)) and o.suspended_at is null
$$;
revoke all on function public.resolve_company_link(text) from public;
grant execute on function public.resolve_company_link(text) to anon, authenticated, service_role;

-- ───────────────────────────────────────────── field staff add-on (Pro, Paystack)
alter table public.payments add column if not exists field_seats integer not null default 0
  check (field_seats between 0 and 100000);
alter table public.payments drop constraint if exists payments_kind_check;
alter table public.payments add constraint payments_kind_check check (kind in ('subscription','seat_increase','field_addon'));

-- Naira per field person per month.
create or replace function public.field_addon_price()
returns integer language sql immutable as $$ select 150 $$;
grant execute on function public.field_addon_price() to anon, authenticated, service_role;

create or replace function public.field_addon_kobo(p_plan text, p_field integer, p_months integer)
returns bigint language sql immutable as $$
  select case when p_plan = 'pro' then greatest(coalesce(p_field, 0), 0)::bigint * public.field_addon_price() * p_months * 100 else 0 end
$$;
grant execute on function public.field_addon_kobo(text, integer, integer) to authenticated, service_role;

-- What the next automatic renewal should charge: seats plus the field add-on on Pro.
create or replace function public.renewal_amount_kobo(p_org uuid)
returns bigint language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select s.seats_paid::bigint * public.plan_price(s.plan) * s.billing_interval_months * 100
       + public.field_addon_kobo(s.plan, o.field_addon_seats, s.billing_interval_months)
    from public.subscriptions s join public.organizations o on o.id = s.org_id where s.org_id = p_org
$$;
revoke all on function public.renewal_amount_kobo(uuid) from public, anon, authenticated;
grant execute on function public.renewal_amount_kobo(uuid) to service_role;

drop function if exists public.prepare_paystack_subscription(text, text, integer, integer, boolean);
create function public.prepare_paystack_subscription(p_reference text, p_plan text, p_seats integer, p_months integer,
  p_auto_renew boolean default false, p_field_seats integer default 0)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_sub public.subscriptions%rowtype; v_used integer; v_field_used integer;
  v_now timestamptz := clock_timestamp(); v_price integer; v_amount bigint; v_term_running boolean; v_field integer := coalesce(p_field_seats, 0);
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
  v_price := public.plan_price(p_plan);
  v_amount := p_seats::bigint*v_price*p_months*100 + public.field_addon_kobo(p_plan, v_field, p_months);
  insert into public.payments(reference,org_id,plan,seats,billing_interval_months,amount_kobo,currency,status,kind,field_seats)
    values(p_reference,v_org,p_plan,p_seats,p_months,v_amount,'NGN','pending','subscription',v_field);
  return jsonb_build_object('ok',true,'reference',p_reference,'amount_kobo',v_amount,'seats',p_seats,'months',p_months,
    'auto_renew',p_auto_renew,'field_seats',v_field);
end $$;
revoke all on function public.prepare_paystack_subscription(text, text, integer, integer, boolean, integer) from public, anon;
grant execute on function public.prepare_paystack_subscription(text, text, integer, integer, boolean, integer) to authenticated;

-- Add field staff places during a paid Pro term, prorated to the end of the term.
create or replace function public.prepare_paystack_field_addon(p_reference text, p_field_seats integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_org uuid := public.my_org_id(); v_sub public.subscriptions%rowtype; v_cur integer;
  v_now timestamptz := clock_timestamp(); v_from timestamptz; v_full bigint; v_amount bigint;
begin
  perform public.rate_limit_hit('payment_start', 'o:' || public.my_org_id(), 20, interval '1 hour');
  if auth.uid() is null or not public.is_org_admin() or v_org is null then raise exception 'Only this company''s admins can change billing.'; end if;
  if p_reference is null or p_reference !~ '^[-A-Za-z0-9.=]{1,100}$' or p_field_seats is null or p_field_seats < 1 or p_field_seats > 10000 then
    raise exception 'Field staff checkout details are invalid.';
  end if;
  select * into v_sub from public.subscriptions where org_id=v_org for update;
  if not found or v_sub.status<>'active' or v_sub.current_period_start is null
    or v_sub.current_period_end is null or v_sub.current_period_end<=v_now then
    raise exception 'An active paid term is required to add field staff places.';
  end if;
  if v_sub.plan = 'premium' then raise exception 'Premium already includes field staff.'; end if;
  if v_sub.plan <> 'pro' then raise exception 'The field staff add-on is for Pro. Premium includes field staff.'; end if;
  select field_addon_seats into v_cur from public.organizations where id = v_org;
  if p_field_seats <= v_cur then raise exception 'Choose more field staff places than you have now (%).', v_cur; end if;
  if p_field_seats > v_sub.seats_paid then raise exception 'Field staff places cannot be more than paid seats (%).', v_sub.seats_paid; end if;
  if exists(select 1 from public.payments where org_id=v_org and status='pending') then
    raise exception 'A payment is already pending. Complete it or check its status before starting another.';
  end if;
  v_full := public.field_addon_kobo('pro', p_field_seats - v_cur, v_sub.billing_interval_months);
  v_from := greatest(v_now, v_sub.current_period_start);
  v_amount := greatest(100, round(v_full * extract(epoch from (v_sub.current_period_end - v_from))
                                / extract(epoch from (v_sub.current_period_end - v_sub.current_period_start))))::bigint;
  insert into public.payments(reference,org_id,plan,seats,billing_interval_months,amount_kobo,currency,status,kind,field_seats,paystack_plan_code)
    values(p_reference,v_org,v_sub.plan,v_sub.seats_paid,v_sub.billing_interval_months,v_amount,'NGN','pending','field_addon',p_field_seats,v_sub.paystack_plan_code);
  return jsonb_build_object('ok',true,'reference',p_reference,'amount_kobo',v_amount,'added_places',p_field_seats-v_cur,'field_seats',p_field_seats);
end $$;
revoke all on function public.prepare_paystack_field_addon(text, integer) from public, anon;
grant execute on function public.prepare_paystack_field_addon(text, integer) to authenticated;

create or replace function public.apply_paystack_payment(p_reference text, p_status text, p_amount_kobo bigint, p_currency text,
  p_customer_code text default null, p_subscription_code text default null, p_plan_code text default null, p_email_token text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_payment public.payments%rowtype; v_sub public.subscriptions%rowtype;
  v_org uuid; v_plan text; v_seats integer; v_months integer; v_expected bigint;
  v_base timestamptz; v_inserted integer; v_claim_status text; v_kind text := 'subscription';
  v_manual boolean := false; v_known boolean := false; v_running boolean; v_field integer := 0;
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
    v_known := true;
    if v_payment.status = 'applied' then return jsonb_build_object('ok', true, 'reason', 'already applied'); end if;
    if v_payment.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'payment reference is not pending'); end if;
    v_org := v_payment.org_id; v_plan := v_payment.plan; v_seats := v_payment.seats; v_months := v_payment.billing_interval_months;
    v_kind := v_payment.kind; v_field := v_payment.field_seats;
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
    v_expected := public.renewal_amount_kobo(v_org);
    select case when v_plan = 'pro' then field_addon_seats else 0 end into v_field from public.organizations where id = v_org;
  end if;

  if p_amount_kobo <> v_expected then
    update public.payments set status = 'failed' where reference = p_reference and status = 'pending';
    return jsonb_build_object('ok', false, 'reason', 'verified amount does not match the expected charge');
  end if;
  if v_seats < 1 or v_months not in (1,3,6,12) then return jsonb_build_object('ok', false, 'reason', 'subscription details invalid'); end if;

  select * into v_sub from public.subscriptions where org_id = v_org for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'subscription not found'); end if;
  if v_kind in ('seat_increase','field_addon') then
    if v_sub.status not in ('active','past_due')
      or v_sub.paystack_plan_code is distinct from v_payment.paystack_plan_code
      or v_sub.plan is distinct from v_payment.plan or v_sub.billing_interval_months<>v_payment.billing_interval_months then
      return jsonb_build_object('ok',false,'reason','subscription changed while the payment was pending');
    end if;
  end if;
  if v_kind='seat_increase' then
    if v_seats<=v_sub.seats_paid or v_seats<(select count(*) from public.members where org_id=v_org and status in ('active','invited')) then
      return jsonb_build_object('ok',false,'reason','seat increase is no longer valid');
    end if;
    update public.subscriptions set seats_paid=v_seats,updated_at=now() where org_id=v_org;
    update public.payments set status='applied',applied_at=now(),
        renewal_sync_status=case when v_payment.paystack_plan_code is null then 'not_required' else 'pending' end,
        renewal_sync_error=null
      where reference=p_reference and status='pending';
    return jsonb_build_object('ok',true,
      'reason',case when v_payment.paystack_plan_code is null then 'added seats applied' else 'added seats applied; renewal price sync pending' end,
      'kind','seat_increase','seats',v_seats);
  end if;
  if v_kind='field_addon' then
    if v_sub.plan <> 'pro' or v_field <= (select field_addon_seats from public.organizations where id = v_org) then
      return jsonb_build_object('ok',false,'reason','field staff add-on is no longer valid');
    end if;
    update public.organizations set field_addon_seats = v_field where id = v_org;
    update public.payments set status='applied',applied_at=now(),
        renewal_sync_status=case when v_payment.paystack_plan_code is null then 'not_required' else 'pending' end,
        renewal_sync_error=null
      where reference=p_reference and status='pending';
    return jsonb_build_object('ok',true,
      'reason',case when v_payment.paystack_plan_code is null then 'field staff places applied' else 'field staff places applied; renewal price sync pending' end,
      'kind','field_addon','field_seats',v_field);
  end if;

  if v_payment.reference is null then
    insert into public.payments(reference,org_id,plan,seats,billing_interval_months,amount_kobo,currency,status,
      paystack_customer,paystack_plan_code,paystack_subscription_code,field_seats)
    values(p_reference,v_org,v_plan,v_seats,v_months,p_amount_kobo,'NGN','pending',p_customer_code,p_plan_code,p_subscription_code,v_field)
    on conflict (reference) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      select status into v_claim_status from public.payments where reference=p_reference;
      if v_claim_status='applied' then return jsonb_build_object('ok',true,'reason','already applied'); end if;
      return jsonb_build_object('ok',false,'reason','payment reference is already being processed');
    end if;
    v_payment.reference := p_reference;
  end if;

  v_running := v_sub.status in ('active','past_due') and v_sub.current_period_end > now();
  if v_manual then
    -- Pay-per-term. Paying ahead adds a new term right after the current paid term (or after
    -- the trial); seats increase immediately and never drop below what is already paid.
    if v_running then
      v_base := v_sub.current_period_end;
    elsif v_sub.status = 'trialing' and v_sub.trial_ends_at > now() then
      v_base := v_sub.trial_ends_at;
    else
      v_base := now();
    end if;
    update public.subscriptions set
      plan = v_plan, status = 'active',
      seats_paid = case when v_running then greatest(v_seats, v_sub.seats_paid) else v_seats end,
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
  -- The field add-on follows the plan term: set by a new term on Pro, cleared on Basic,
  -- left alone on Premium (included). Paying ahead never removes places already paid for.
  if v_known then
    if v_plan = 'basic' then
      update public.organizations set field_addon_seats = 0 where id = v_org;
    elsif v_plan = 'pro' then
      update public.organizations set field_addon_seats = case when v_manual and v_running then greatest(v_field, field_addon_seats) else v_field end
       where id = v_org;
    end if;
  end if;
  update public.payments set status = 'applied', applied_at = now(), paystack_customer = p_customer_code,
    paystack_subscription_code = coalesce(p_subscription_code, paystack_subscription_code)
  where reference = p_reference and status = 'pending';
  return jsonb_build_object('ok', true, 'reason', 'applied', 'manual', v_manual);
end $$;
revoke all on function public.apply_paystack_payment(text, text, bigint, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_paystack_payment(text, text, bigint, text, text, text, text, text) to service_role;

-- Pending field add-on checkouts are handled like seat checkouts elsewhere.
do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.release_missing_paystack_checkout'::regproc);
  v_new := replace(v_def, $q$kind in ('subscription','seat_increase')$q$, $q$kind in ('subscription','seat_increase','field_addon')$q$);
  if v_new = v_def then raise exception 'release_missing_paystack_checkout: expected text not found'; end if;
  execute v_new;
  v_def := pg_get_functiondef('public.prepare_paystack_seat_increase(text, integer)'::regprocedure);
  v_new := replace(v_def, $q$kind='subscription' and status='pending'$q$, $q$kind in ('subscription','field_addon') and status='pending'$q$);
  if v_new = v_def then raise exception 'prepare_paystack_seat_increase: expected text not found'; end if;
  execute v_new;
end $$;

commit;
