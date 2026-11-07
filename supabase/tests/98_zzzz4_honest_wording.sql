-- 5ime: plan features and blog posts describe check-in honestly (0036).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
reset role;

\echo '--- Pro plan: automatic check-in works when staff open 5ime at work'
select test.ok(not exists (select 1 from public.platform_plans where 'Automatic check-in on arrival, overtime and company holidays' = any (features)),
  'No plan still says "Automatic check-in on arrival"');
select test.ok(exists (select 1 from public.platform_plans where plan = 'pro'
                         and 'Automatic check-in when staff open 5ime at work, overtime and company holidays' = any (features)),
  'Pro says automatic check-in works when staff open 5ime at work');

\echo '--- blog: weak or out-of-area check ins are recorded and flagged, not refused'
select test.ok(not exists (select 1 from public.blog_posts
                            where body ilike '%rough readings are refused%' or body ilike '%refuses readings that are too rough%'
                               or faq::text ilike '%refusing rough readings%' or faq::text ilike '%rough readings are refused%'),
  'No blog post says rough readings are refused');
select test.ok((select faq::text ilike '%flags weak GPS and check ins outside the approved area%' from public.blog_posts
                 where slug = 'fingerprint-attendance-vs-phone-check-in'), 'Fingerprint post: honest answer to "Can staff cheat"');
select test.ok((select body ilike '%weak GPS and out-of-area check ins are flagged for admin review%' from public.blog_posts
                 where slug = 'best-jibble-alternatives'), 'Best Jibble alternatives: honest verification line');

\echo '--- a post edited in Global Admin is not overwritten by a seed update'
update public.blog_posts set body = 'Edited by a writer', updated_by = (select id from auth.users limit 1) where slug = 'best-jibble-alternatives';
\i migrations/0036_honest_check_in_wording.sql
\o /dev/null
select test.ok((select body from public.blog_posts where slug = 'best-jibble-alternatives') = 'Edited by a writer',
  'Running the update again leaves an edited post alone');

\o
\echo '✅ HONEST WORDING TESTS PASSED'
