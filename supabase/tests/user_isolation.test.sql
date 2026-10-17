-- Two users share the database; neither may see or change the other's plans and logs, and
-- "last time" pre-fills, previous sessions and history only ever draw on the caller's own
-- workouts. Run with `pnpm test:db` (local stack must be running). Everything rolls back.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.local');

-- Acts as a signed-in user for the rest of the transaction, the way PostgREST does for a request
-- carrying that user's JWT.
create function pg_temp.sign_in_as(p_user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
$$;

-- Ids created as one user and used as another. The test runner owns it; users only read it.
create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated;

-- User A: a plan, and one finished workout ------------------------------------------------------

select pg_temp.sign_in_as('aaaaaaaa-0000-0000-0000-000000000001');

insert into ids select 'plan_a', create_workout_plan('Upper', '[{"name":"Bench","sets":2,"reps":5}]');
select isnt(create_workout_log('2026-10-01', (select id from ids where name = 'plan_a')), null, 'A starts a log from their plan');
select ok(
  save_workout_log('2026-10-01', '[{"name":"Bench","targetSets":2,"targetReps":5,"note":"felt strong","sets":[{"reps":5,"weight":100,"done":true},{"reps":5,"weight":100,"done":true}]}]'),
  'A saves their log'
);

-- User B: sees and changes none of it -----------------------------------------------------------

select pg_temp.sign_in_as('bbbbbbbb-0000-0000-0000-000000000002');

select is_empty('select 1 from workout_plans', 'B sees none of A''s plans');
select is_empty('select 1 from plan_exercises', 'B sees none of A''s plan exercises');
select is_empty('select 1 from workout_logs', 'B sees none of A''s logs');
select is_empty('select 1 from log_exercises', 'B sees none of A''s logged exercises');
select is_empty('select 1 from log_sets', 'B sees none of A''s logged sets');
select is(get_workout_log('2026-10-01'), null, 'B cannot read A''s log for the day');
select is(get_exercise_history(), '[]'::jsonb, 'B''s history has none of A''s workouts');
select is(create_workout_log('2026-10-02', (select id from ids where name = 'plan_a')), null, 'B cannot start a log from A''s plan');
select ok(not save_workout_log('2026-10-01', '[]'), 'B cannot overwrite A''s log');

delete from workout_logs where log_date = '2026-10-01';
delete from workout_plans;
update workout_plans set name = 'Hijacked';

select throws_ok(
  $$insert into workout_plans (user_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Planted')$$,
  '42501', null, 'B cannot create a plan owned by A'
);

-- B's own data: same day and the same exercise as A, without picking up A's numbers.
insert into ids select 'plan_b', create_workout_plan('Upper', '[{"name":"bench","sets":2,"reps":5}]');
select isnt(create_workout_log('2026-10-01', (select id from ids where name = 'plan_b')), null, 'B can log the same day as A');
select is(
  (select count(*)::int from log_sets where weight is not null), 0,
  'B''s first log is not pre-filled with A''s weights'
);
select is(get_workout_log('2026-10-01') -> 'exercises' -> 0 -> 'previous', 'null'::jsonb, 'B''s log shows no previous session from A');

-- A again: everything intact, and A's own "last time" still works -------------------------------

select pg_temp.sign_in_as('aaaaaaaa-0000-0000-0000-000000000001');

select results_eq('select name from workout_plans', $$values ('Upper')$$, 'A''s plan survived B''s delete and update');
select is((select count(*)::int from workout_plans), 1, 'A sees only their own plan');
select is(get_workout_log('2026-10-01') -> 'exercises' -> 0 ->> 'note', 'felt strong', 'A''s log survived B''s writes');
select isnt(create_workout_log('2026-10-03', (select id from ids where name = 'plan_a')), null, 'A starts a second log');
select results_eq(
  $$select s.weight from log_sets s
    join log_exercises e on e.id = s.log_exercise_id
    join workout_logs l on l.id = e.log_id
    where l.log_date = '2026-10-03' order by s.position$$,
  $$values (100.00::numeric(6, 2)), (100.00)$$,
  'A''s second log is pre-filled from A''s last workout'
);
select is(jsonb_array_length(get_exercise_history('bench')), 1, 'A''s history has exactly A''s one finished session');

-- Deleting a plan keeps its logs (and their owner), clearing only the link.
delete from workout_plans where id = (select id from ids where name = 'plan_a');
select results_eq(
  $$select bool_and(plan_id is null and user_id = 'aaaaaaaa-0000-0000-0000-000000000001') from workout_logs$$,
  $$values (true)$$,
  'Deleting a plan keeps its logs'
);

-- Signed out: no access at all ------------------------------------------------------------------

reset role;
set local role anon;

select throws_ok('select 1 from workout_plans', '42501', null, 'Signed-out callers cannot read tables');
select throws_ok('select get_exercise_history()', '42501', null, 'Signed-out callers cannot call the functions');

select * from finish();
rollback;
