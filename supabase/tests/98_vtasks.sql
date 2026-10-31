-- 5ime: task management (migration 0023). Visit Ltd (Premium): boss (owner), ade and bisi (staff). Other Visit Ltd (Basic).
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

reset role;
select set_config('test.uid', '', false);
select set_config('test.ade', (select id::text from public.members where email = 'ade@visit.ng'), false);
select set_config('test.bisi', (select id::text from public.members where email = 'bisi@visit.ng'), false);
select set_config('test.boss', (select id::text from public.members where email = 'boss@visit.ng'), false);

\echo '--- creating and assigning'
set role authenticated;
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select set_config('test.t1', public.create_task(jsonb_build_object('title', 'Prepare the monthly report', 'assignees', jsonb_build_array(current_setting('test.ade')),
  'due_date', current_date + 3, 'priority', 'high', 'needs_review', true, 'labels', jsonb_build_array('Reports', ' reports '), 'checklist', jsonb_build_array('Collect figures', 'Draft')))::text, false);
select test.ok((select labels = array['reports'] and needs_review from public.tasks where id = current_setting('test.t1')::uuid), 'An admin assigns a task with labels and a review');
select test.ok((select count(*) from public.task_checklist where task_id = current_setting('test.t1')::uuid) = 2, 'with checklist steps');
select set_config('test.p1', public.save_task_project(null, 'Office move', null, '#1e4e9c', false)::text, false);

select test.as_console('00000000-0000-0000-0000-00000000f902', 'ade@visit.ng');
select test.ok((select count(*) from public.tasks where id = current_setting('test.t1')::uuid) = 1, 'The assignee sees it');
select test.blocked(format($$select public.create_task('{"title":"Do this","assignees":["%s"]}')$$, current_setting('test.bisi')), 'people you manage', 'Staff cannot give tasks to colleagues');
select test.ok(public.create_task('{"title":"My own note"}') is not null, 'Staff create their own tasks');
select test.blocked(format($$select public.update_task(%L, '{"title":"Easier"}')$$, current_setting('test.t1')), 'Only the person who created', 'Assignees cannot rewrite the task');
select test.blocked(format($$select public.delete_task(%L)$$, current_setting('test.t1')), 'Only the person who created', 'or delete it');
select public.toggle_check_item((select id from public.task_checklist where task_id = current_setting('test.t1')::uuid order by position limit 1), true);
select test.ok(public.set_task_status(current_setting('test.t1')::uuid, 'done') = 'in_review', 'Marking done sends it for review');
select test.blocked(format($$select public.review_task(%L, true, null)$$, current_setting('test.t1')), 'Only the person who created', 'The assignee cannot approve their own work');

select test.as_console('00000000-0000-0000-0000-00000000f903', 'bisi@visit.ng');
select test.ok((select count(*) from public.tasks where id = current_setting('test.t1')::uuid) = 0 and (select count(*) from public.task_comments) = 0,
  'Colleagues not on the task cannot see it');

\echo '--- review and follow up'
select test.as_console('00000000-0000-0000-0000-00000000f901', 'boss@visit.ng');
select test.blocked(format($$select public.review_task(%L, false, '')$$, current_setting('test.t1')), 'still needs doing', 'Sending back needs a note');
select public.review_task(current_setting('test.t1')::uuid, false, 'Add last month''s figures');
select test.ok((select status = 'in_progress' from public.tasks where id = current_setting('test.t1')::uuid), 'Sent back to In progress');
select public.request_task_update(current_setting('test.t1')::uuid, null);
select test.ok((select count(*) from public.task_comments where task_id = current_setting('test.t1')::uuid and kind = 'update_request') = 1, 'Request update leaves a note on the task');
select public.review_task(current_setting('test.t1')::uuid, true, null) where false;  -- not in review now
select test.ok(public.set_task_status(current_setting('test.t1')::uuid, 'done') = 'done', 'A manager who is not doing the work can close it directly');
select test.ok((select count(*) from public.task_activity where task_id = current_setting('test.t1')::uuid) >= 5, 'Every step is in the history');

\echo '--- recurring'
select set_config('test.t2', public.create_task(jsonb_build_object('title', 'Weekly report', 'assignees', jsonb_build_array(current_setting('test.ade')),
  'due_date', current_date, 'recurrence', 'weekly', 'project_id', current_setting('test.p1')))::text, false);
select public.set_task_status(current_setting('test.t2')::uuid, 'done');
select test.ok((select count(*) from public.tasks where repeat_of = current_setting('test.t2')::uuid and due_date = current_date + 7 and recurrence = 'weekly') = 1,
  'Completing a weekly task creates next week''s');
select test.ok(jsonb_array_length(public.task_report(current_date - 30, current_date)) >= 3, 'Managers get a report per person');

\echo '--- Basic and other companies'
select test.as_console('00000000-0000-0000-0000-00000000f911', 'boss@other-visit.ng');
select test.ok((select count(*) from public.tasks) = 0 and (select count(*) from public.task_projects) = 0, 'Another company sees none of these tasks');
select test.ok(public.create_task('{"title":"Simple task","due_date":"2030-01-01","priority":"low"}') is not null, 'Basic companies have simple tasks');
select test.blocked($$select public.create_task('{"title":"Steps","checklist":["a"]}')$$, 'Pro and Premium', 'Checklists are Pro and Premium');
select test.blocked($$select public.save_task_project(null, 'Big project', null, null, false)$$, 'Pro and Premium', 'and so are projects');
reset role;
select set_config('test.uid', '', false);

\echo '--- reminders'
update public.tasks set due_date = current_date - 1, reminded_on = null, status = 'todo' where id = current_setting('test.t1')::uuid;
set role service_role;
select set_config('test.rem', public.claim_task_reminders()::text, false);
reset role;
select set_config('test.uid', '', false);
select test.ok(
  (select count(*) from jsonb_array_elements(current_setting('test.rem')::jsonb) r where r ->> 'task_id' = current_setting('test.t1') and r ->> 'kind' = 'overdue')
  = case when (now() at time zone (select timezone from public.organizations where domain = 'visit.ng'))::time >= '08:00' then 1 else 0 end,
  'From 8:00, overdue tasks are claimed once for a reminder');
delete from public.tasks where org_id in (select id from public.organizations where domain in ('visit.ng','other-visit.ng'));
delete from public.task_projects where org_id in (select id from public.organizations where domain in ('visit.ng','other-visit.ng'));

\o
\echo '✅ TASK TESTS PASSED'
