-- 5ime: block company links that clash with the site's own pages.
-- A company whose link was e.g. "signup" would have a staff link that opens the
-- sign-up page instead of their portal. Apply after 0012. Safe to re-run.
begin;

create or replace function public.reserved_slugs()
returns text[] language sql immutable as $$
  select array['app','admin','console','login','start','onboarding','pending','api','auth','preview','support',
               'help','pricing','about','terms','privacy','static','assets','www','mail','billing','dashboard',
               'manifest','icon','sw','offline','5ime','fivetime','koraforge',
               -- added: pages and files that exist or may exist at the top level
               'signup','sign-up','register','robots','robots.txt','sitemap','sitemap.xml','global-admin','global',
               'security','settings','account','logout','signout','invite','reset','forgot','contact','legal',
               'status','docs','blog','careers','error','not-found','favicon.ico','apple-touch-icon.png',
               'icon.svg','icon-192.png','icon-512.png','offline.html','sw.js','manifest.webmanifest']
$$;

-- Any company that already holds a newly reserved link gets a free one (name-based, numbered).
do $$
declare o record;
begin
  for o in select id, slug from public.organizations where slug = any (public.reserved_slugs()) loop
    update public.organizations set slug = public.unique_org_slug(slug || '-team') where id = o.id;
  end loop;
end $$;

commit;
