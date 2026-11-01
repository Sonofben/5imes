-- 5ime: blog posts written in Global Admin, and the "Talk to sales" form (migration 0026).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
select set_config('test.uid', '', false);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c9', 'writer@5imes.click') on conflict do nothing;
insert into public.platform_staff (user_id, email, role) values ('00000000-0000-0000-0000-0000000000c9', 'writer@5imes.click', 'writer')
  on conflict (user_id) do update set role = 'writer';

\echo '--- writers'
set role authenticated;
select test.as_console('00000000-0000-0000-0000-0000000000c9', 'writer@5imes.click');
select set_config('test.post', public.console_save_post(null,
  '{"slug":"test-post","title":"A test post","excerpt":"Short","body":"## Hello\n\nText","category":"guide","tags":["Attendance"],"faq":[{"q":"Why?","a":"Because."}]}'::jsonb,
  false)::text, false);
select test.ok((select count(*) = 1 from public.console_blog_posts() where status = 'draft'), 'A writer saves a draft');
select test.blocked($$select public.console_companies(null, false)$$, 'cannot do this', 'Writers see no company data');
select test.blocked($$select * from public.console_sales_enquiries()$$, 'cannot do this', 'or sales enquiries');
select test.blocked(format($$select public.console_delete_post(%L, 'cleanup test')$$, current_setting('test.post')), 'cannot do this', 'Only a Global admin deletes posts');
select test.blocked($$select public.console_save_post(null, '{"slug":"test-post","title":"Same link again"}'::jsonb, false)$$, 'already uses that link', 'Post links are unique');
select test.blocked($$select public.console_save_post(null, '{"slug":"x y","title":"Bad link"}'::jsonb, false)$$, 'blog_posts_slug_check', 'Post links are checked');
reset role;
select set_config('test.uid', '', false);
set role anon;
select test.ok((select count(*) = 0 from public.blog_posts where slug = 'test-post'), 'Visitors cannot see drafts');
reset role;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-0000000000c9', 'writer@5imes.click');
select public.console_save_post(current_setting('test.post')::uuid,
  '{"slug":"test-post","title":"A test post","excerpt":"Short","body":"Text","category":"guide","faq":[]}'::jsonb, true);
select public.console_save_post(current_setting('test.post')::uuid,
  '{"slug":"test-post","title":"A test post","excerpt":"Short","body":"Text","category":"guide","faq":[]}'::jsonb, false, null);
select test.ok((select published_at is not null and status = 'draft' from public.console_blog_posts() where slug = 'test-post'),
  'Unpublishing keeps the original date');
select public.console_save_post(current_setting('test.post')::uuid,
  '{"slug":"test-post","title":"A test post","excerpt":"Short","body":"Text","category":"guide","faq":[]}'::jsonb, true);
select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select test.blocked($$select * from public.console_blog_posts()$$, 'Console access', 'Company staff cannot use the editor');
select test.blocked($$update public.blog_posts set title = 'Hacked'$$, 'permission denied', 'Nobody edits posts directly');
reset role;
select set_config('test.uid', '', false);
set role anon;
select test.ok((select count(*) = 1 from public.blog_posts where slug = 'test-post'), 'Visitors see a published post');
reset role;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select public.console_delete_post(current_setting('test.post')::uuid, 'test cleanup');
select test.ok((select count(*) = 0 from public.console_blog_posts() where slug = 'test-post'), 'A Global admin deletes a post');

\echo '--- talk to sales'
reset role;
select set_config('test.uid', '', false);
set role anon;
select test.ok(public.submit_sales_enquiry('Ada Obi', 'ada@halden.ng', 'Halden', null, 120, 'We have 3 branches and want a quote.') is not null,
  'A visitor sends an enquiry');
select public.submit_sales_enquiry('Ada Obi', 'ada@halden.ng', 'Halden', null, 120, 'Second message for the quote.');
select public.submit_sales_enquiry('Ada Obi', 'ada@halden.ng', 'Halden', null, 120, 'Third message for the quote.');
select test.blocked($$select public.submit_sales_enquiry('Ada Obi', 'ada@halden.ng', 'Halden', null, 120, 'Fourth message for the quote.')$$,
  'Too many', 'One email cannot flood the form');
select test.blocked($$select count(*) from public.sales_enquiries$$, 'permission denied', 'Visitors cannot read enquiries');
reset role;
set role authenticated;
select test.as_console('00000000-0000-0000-0000-0000000000c1', 'joseph@koraforge.com');
select test.ok((select count(*) = 3 from public.console_sales_enquiries()), 'Global Admin sees enquiries');
reset role;
select set_config('test.uid', '', false);
delete from public.sales_enquiries; delete from public.rate_limits where bucket = 'sales_enquiry';
delete from public.platform_staff where user_id = '00000000-0000-0000-0000-0000000000c9';
\o
\echo '✅ BLOG AND SALES TESTS PASSED'
