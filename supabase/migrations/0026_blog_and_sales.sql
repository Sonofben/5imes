-- 5ime: blog (posts written in Global Admin by owners and a new Writer role) and the
-- "Talk to sales" form on the website. Apply after 0025.
begin;

-- ───────────────────────────────────────────── Writer role for Global Admin
alter table public.platform_staff drop constraint if exists platform_staff_role_check;
alter table public.platform_staff add constraint platform_staff_role_check
  check (role in ('owner','support','finance','viewer','writer'));

do $$
declare f text; v_def text; v_new text;
begin
  foreach f in array array['public.console_team_add(text, text, text)', 'public.console_team_set_role(uuid, text, text)'] loop
    v_def := pg_get_functiondef(f::regprocedure);
    v_new := replace(v_def, $q$p_role not in ('owner','support','finance','viewer')$q$, $q$p_role not in ('owner','support','finance','viewer','writer')$q$);
    if v_new = v_def then raise exception '%: expected text not found', f; end if;
    execute v_new;
  end loop;
end $$;

-- ───────────────────────────────────────────── blog posts
create table if not exists public.blog_posts (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  title           text not null check (length(trim(title)) between 5 and 140),
  excerpt         text not null default '' check (length(excerpt) <= 320),
  body            text not null default '' check (length(body) <= 80000),
  category        text not null default 'guide' check (category in ('comparison','guide','product','news')),
  tags            text[] not null default '{}' check (coalesce(array_length(tags, 1), 0) <= 12),
  cover_url       text check (cover_url is null or (cover_url ~ '^https://' and length(cover_url) <= 500)),
  author_name     text not null default '5ime team' check (length(author_name) between 2 and 80),
  seo_title       text check (seo_title is null or length(seo_title) <= 70),
  seo_description text check (seo_description is null or length(seo_description) <= 170),
  faq             jsonb not null default '[]'::jsonb check (jsonb_typeof(faq) = 'array' and jsonb_array_length(faq) <= 20),
  status          text not null default 'draft' check (status in ('draft','published')),
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null,
  check (status = 'draft' or published_at is not null)
);
create index if not exists blog_posts_published_idx on public.blog_posts (published_at desc) where status = 'published';
alter table public.blog_posts enable row level security;
revoke all on public.blog_posts from public, anon, authenticated;
grant select on public.blog_posts to anon, authenticated;
drop policy if exists blog_posts_public_read on public.blog_posts;
create policy blog_posts_public_read on public.blog_posts for select to anon, authenticated
  using (status = 'published' and published_at <= now());

-- Global Admin: every post, drafts included (owners, support and writers).
create or replace function public.console_blog_posts()
returns setof public.blog_posts language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','writer']);
  return query select * from public.blog_posts order by coalesce(published_at, updated_at) desc;
end $$;
revoke all on function public.console_blog_posts() from public, anon;
grant execute on function public.console_blog_posts() to authenticated;

-- Create or update a post. p_id null creates. Publishing sets the date once (or to p_publish_at).
create or replace function public.console_save_post(p_id uuid, p_post jsonb, p_publish boolean, p_publish_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_id uuid := p_id; v_old public.blog_posts%rowtype; v_faq jsonb := coalesce(p_post -> 'faq', '[]'::jsonb); e jsonb;
  v_tags text[];
begin
  perform public.console_require(array['owner','writer']);
  perform public.rate_limit_hit('blog_save', 'u:' || auth.uid(), 200, interval '1 hour');
  if jsonb_typeof(v_faq) <> 'array' then raise exception 'FAQ must be a list.'; end if;
  for e in select * from jsonb_array_elements(v_faq) loop
    if length(trim(coalesce(e ->> 'q', ''))) < 3 or length(trim(coalesce(e ->> 'a', ''))) < 3 or length(e ->> 'q') > 300 or length(e ->> 'a') > 2000 then
      raise exception 'Each FAQ needs a question and an answer.';
    end if;
  end loop;
  select array(select lower(trim(t)) from jsonb_array_elements_text(coalesce(p_post -> 'tags', '[]'::jsonb)) t where trim(t) <> '' limit 12) into v_tags;
  if v_id is not null then
    select * into v_old from public.blog_posts where id = v_id for update;
    if not found then raise exception 'That post no longer exists.'; end if;
  end if;
  if v_id is null then
    insert into public.blog_posts (slug, title, excerpt, body, category, tags, cover_url, author_name, seo_title, seo_description, faq,
                                   status, published_at, created_by, updated_by)
    values (lower(trim(p_post ->> 'slug')), trim(p_post ->> 'title'), coalesce(trim(p_post ->> 'excerpt'), ''), coalesce(p_post ->> 'body', ''),
            coalesce(p_post ->> 'category', 'guide'), v_tags, nullif(trim(coalesce(p_post ->> 'cover_url', '')), ''),
            coalesce(nullif(trim(coalesce(p_post ->> 'author_name', '')), ''), '5ime team'),
            nullif(trim(coalesce(p_post ->> 'seo_title', '')), ''), nullif(trim(coalesce(p_post ->> 'seo_description', '')), ''), v_faq,
            case when p_publish then 'published' else 'draft' end,
            case when p_publish then coalesce(p_publish_at, now()) end, auth.uid(), auth.uid())
    returning id into v_id;
  else
    update public.blog_posts set
      slug = lower(trim(p_post ->> 'slug')), title = trim(p_post ->> 'title'), excerpt = coalesce(trim(p_post ->> 'excerpt'), ''),
      body = coalesce(p_post ->> 'body', ''), category = coalesce(p_post ->> 'category', 'guide'), tags = v_tags,
      cover_url = case when p_post ? 'cover_url' then nullif(trim(coalesce(p_post ->> 'cover_url', '')), '') else cover_url end,
      author_name = coalesce(nullif(trim(coalesce(p_post ->> 'author_name', '')), ''), '5ime team'),
      seo_title = nullif(trim(coalesce(p_post ->> 'seo_title', '')), ''), seo_description = nullif(trim(coalesce(p_post ->> 'seo_description', '')), ''),
      faq = v_faq,
      status = case when p_publish then 'published' else 'draft' end,
      published_at = case when p_publish then coalesce(p_publish_at, v_old.published_at, now()) else v_old.published_at end,
      updated_at = now(), updated_by = auth.uid()
    where id = v_id;
  end if;
  perform public.console_log(null, case when p_publish then 'blog.publish' else 'blog.save' end, null, jsonb_build_object('post', v_id));
  return v_id;
exception when unique_violation then
  raise exception 'Another post already uses that link.';
end $$;
revoke all on function public.console_save_post(uuid, jsonb, boolean, timestamptz) from public, anon;
grant execute on function public.console_save_post(uuid, jsonb, boolean, timestamptz) to authenticated;

create or replace function public.console_delete_post(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner'], p_reason, true);
  delete from public.blog_posts where id = p_id;
  if not found then raise exception 'That post no longer exists.'; end if;
  perform public.console_log(null, 'blog.delete', p_reason, jsonb_build_object('post', p_id));
end $$;
revoke all on function public.console_delete_post(uuid, text) from public, anon;
grant execute on function public.console_delete_post(uuid, text) to authenticated;

-- ───────────────────────────────────────────── "Talk to sales" enquiries
create table if not exists public.sales_enquiries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 2 and 100),
  email       text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  company     text check (company is null or length(company) <= 120),
  phone       text check (phone is null or length(phone) <= 40),
  staff_count integer check (staff_count is null or staff_count between 1 and 1000000),
  message     text not null check (length(trim(message)) between 10 and 4000),
  created_at  timestamptz not null default now(),
  handled_at  timestamptz
);
create index if not exists sales_enquiries_created_idx on public.sales_enquiries (created_at desc);
alter table public.sales_enquiries enable row level security;
revoke all on public.sales_enquiries from public, anon, authenticated;

-- Anyone may send one; limits stop floods. Returns the id so the app can email the sales team.
create or replace function public.submit_sales_enquiry(p_name text, p_email text, p_company text, p_phone text, p_staff integer, p_message text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v_id uuid; v_email text := lower(trim(coalesce(p_email, '')));
begin
  perform public.rate_limit_hit('sales_enquiry', 'global', 300, interval '1 day');
  perform public.rate_limit_hit('sales_enquiry', 'e:' || v_email, 3, interval '1 day');
  insert into public.sales_enquiries (name, email, company, phone, staff_count, message)
  values (trim(p_name), v_email, nullif(trim(coalesce(p_company, '')), ''), nullif(trim(coalesce(p_phone, '')), ''), p_staff, trim(p_message))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_sales_enquiry(text, text, text, text, integer, text) from public;
grant execute on function public.submit_sales_enquiry(text, text, text, text, integer, text) to anon, authenticated;

create or replace function public.console_sales_enquiries()
returns setof public.sales_enquiries language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','finance']);
  return query select * from public.sales_enquiries order by created_at desc limit 500;
end $$;
revoke all on function public.console_sales_enquiries() from public, anon;
grant execute on function public.console_sales_enquiries() to authenticated;

create or replace function public.console_mark_enquiry(p_id uuid, p_handled boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.console_require(array['owner','support','finance']);
  update public.sales_enquiries set handled_at = case when p_handled then now() end where id = p_id;
end $$;
revoke all on function public.console_mark_enquiry(uuid, boolean) from public, anon;
grant execute on function public.console_mark_enquiry(uuid, boolean) to authenticated;

-- Enquiries are kept for two years, then removed (privacy notice says so).
create or replace function public.purge_old_sales_enquiries()
returns integer language sql security definer set search_path = pg_catalog, public, pg_temp as $$
  with d as (delete from public.sales_enquiries where created_at < now() - interval '2 years' returning 1) select count(*)::int from d
$$;
revoke all on function public.purge_old_sales_enquiries() from public, anon, authenticated;
grant execute on function public.purge_old_sales_enquiries() to service_role;

commit;
