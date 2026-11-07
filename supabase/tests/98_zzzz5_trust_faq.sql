-- 5ime: the Jibble comparison post no longer asks "Is 5ime safe to use?" (0037); its other questions stay.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
reset role;

select test.ok(not exists (select 1 from public.blog_posts p, jsonb_array_elements(p.faq) f
                            where f ->> 'q' in ('Is 5ime safe to use?', 'Is 5ime a safe, real company?')),
  'No blog post asks whether 5ime is safe or real');
select test.ok((select count(*) from public.blog_posts p, jsonb_array_elements(p.faq) f
                 where p.slug = 'jibble-alternative-5ime-vs-jibble' and f ->> 'q' in ('Is Jibble free?', 'Is 5ime the same as 5imes?')) = 2,
  'The Jibble post keeps its other questions');

\o
\echo '✅ TRUST FAQ TESTS PASSED'
