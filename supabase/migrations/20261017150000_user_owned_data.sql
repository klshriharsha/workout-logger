-- Multi-user support: every plan and log now belongs to a Supabase Auth user, and Postgres
-- enforces that a user only ever sees and changes their own rows.
--
-- The app stops using the service-role key for requests: Route Handlers call the database with
-- the signed-in user's JWT, so Row Level Security applies and auth.uid() is the caller. The RPCs
-- below run as the caller (security invoker), and also filter on auth.uid() explicitly, so
-- "last time" lookups and history only ever match the caller's own workouts.
--
-- Existing rows have no owner, so they are dropped rather than backfilled.

truncate public.workout_plans, public.workout_logs cascade;

-- Ownership ----------------------------------------------------------------------------------

alter table public.workout_plans
  add column user_id uuid not null default auth.uid() references auth.users (id) on delete cascade;

-- Lets a log's plan link be checked against the log's owner (see the foreign key below).
alter table public.workout_plans add constraint workout_plans_id_user_id_key unique (id, user_id);

create index workout_plans_user_id_created_at_idx on public.workout_plans (user_id, created_at desc);

alter table public.workout_logs
  add column user_id uuid not null default auth.uid() references auth.users (id) on delete cascade;

-- One workout per day per user (was: per day, for everyone). Also serves every lookup of a
-- user's logs by date.
alter table public.workout_logs drop constraint workout_logs_log_date_key;
alter table public.workout_logs add constraint workout_logs_user_id_log_date_key unique (user_id, log_date);

-- A log can only link to its owner's plans. Deleting the plan still keeps the log, clearing just
-- the link (not user_id).
alter table public.workout_logs drop constraint workout_logs_plan_id_fkey;
alter table public.workout_logs
  add constraint workout_logs_plan_id_user_id_fkey foreign key (plan_id, user_id)
  references public.workout_plans (id, user_id) on delete set null (plan_id);

-- Row Level Security -------------------------------------------------------------------------
-- RLS was already enabled on every table, with no policies. Signed-in users get full access to
-- their own rows; child rows are owned through their parent. `(select auth.uid())` is evaluated
-- once per statement rather than once per row.

create policy "Users manage their own plans"
  on public.workout_plans for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users manage their own plan exercises"
  on public.plan_exercises for all to authenticated
  using (exists (
    select 1 from public.workout_plans plan
    where plan.id = plan_exercises.plan_id and plan.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.workout_plans plan
    where plan.id = plan_exercises.plan_id and plan.user_id = (select auth.uid())
  ));

create policy "Users manage their own logs"
  on public.workout_logs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users manage their own logged exercises"
  on public.log_exercises for all to authenticated
  using (exists (
    select 1 from public.workout_logs log
    where log.id = log_exercises.log_id and log.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.workout_logs log
    where log.id = log_exercises.log_id and log.user_id = (select auth.uid())
  ));

create policy "Users manage their own logged sets"
  on public.log_sets for all to authenticated
  using (exists (
    select 1 from public.log_exercises exercise
    join public.workout_logs log on log.id = exercise.log_id
    where exercise.id = log_sets.log_exercise_id and log.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.log_exercises exercise
    join public.workout_logs log on log.id = exercise.log_id
    where exercise.id = log_sets.log_exercise_id and log.user_id = (select auth.uid())
  ));

-- Signed-out callers have no business with any of this.
revoke all on public.workout_plans, public.plan_exercises, public.workout_logs, public.log_exercises, public.log_sets from anon;

-- Functions ----------------------------------------------------------------------------------
-- Same signatures and results as before, now scoped to auth.uid().

create or replace function public.create_workout_plan(p_name text, p_exercises jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan_id uuid;
begin
  insert into public.workout_plans (user_id, name)
  values (auth.uid(), btrim(p_name))
  returning id into v_plan_id;

  insert into public.plan_exercises (plan_id, position, name, sets, reps)
  select
    v_plan_id,
    ordinality - 1,
    btrim(value ->> 'name'),
    (value ->> 'sets')::smallint,
    (value ->> 'reps')::smallint
  from jsonb_array_elements(p_exercises) with ordinality;

  return v_plan_id;
end;
$$;

-- Returns null if the caller has no such plan; raises unique_violation if the caller's day
-- already has a log.
create or replace function public.create_workout_log(p_date date, p_plan_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_log_id uuid;
  v_previous_log_id uuid;
begin
  insert into public.workout_logs (user_id, log_date, plan_id, plan_name)
  select v_user_id, p_date, plan.id, plan.name
  from public.workout_plans plan
  where plan.id = p_plan_id
    and plan.user_id = v_user_id
  returning id into v_log_id;

  if v_log_id is null then
    return null;
  end if;

  -- The most recent earlier workout from this plan, if any.
  select previous_log.id into v_previous_log_id
  from public.workout_logs previous_log
  where previous_log.user_id = v_user_id
    and previous_log.plan_id = p_plan_id
    and previous_log.log_date < p_date
  order by previous_log.log_date desc
  limit 1;

  insert into public.log_exercises (log_id, position, name, target_sets, target_reps)
  select v_log_id, exercise.position, exercise.name, exercise.sets, exercise.reps
  from public.plan_exercises exercise
  where exercise.plan_id = p_plan_id;

  -- Copy that workout's sets, matching exercises by name (the same position first, in case a
  -- plan repeats an exercise). Blank reps (saved as 0) fall back to the target.
  insert into public.log_sets (log_exercise_id, position, reps, weight)
  select
    exercise.id,
    previous_set.position,
    coalesce(nullif(previous_set.reps, 0), exercise.target_reps),
    previous_set.weight
  from public.log_exercises exercise
  cross join lateral (
    select previous_exercise.id
    from public.log_exercises previous_exercise
    where previous_exercise.log_id = v_previous_log_id
      and lower(previous_exercise.name) = lower(exercise.name)
    order by (previous_exercise.position = exercise.position) desc, previous_exercise.position
    limit 1
  ) previous_exercise
  join public.log_sets previous_set on previous_set.log_exercise_id = previous_exercise.id
  where exercise.log_id = v_log_id;

  -- Everything not carried over: one set per target set, pre-filled with the target reps and
  -- the weight used for that set the last time the exercise was done (from any of the caller's
  -- plans).
  insert into public.log_sets (log_exercise_id, position, reps, weight)
  select
    exercise.id,
    set_number.position,
    exercise.target_reps,
    -- Latest earlier session's weight: the same set if it exists, otherwise its last set.
    (
      select previous_set.weight
      from public.log_sets previous_set
      join public.log_exercises previous_exercise on previous_exercise.id = previous_set.log_exercise_id
      join public.workout_logs previous_log on previous_log.id = previous_exercise.log_id
      where previous_log.user_id = v_user_id
        and lower(previous_exercise.name) = lower(exercise.name)
        and previous_log.log_date < p_date
        and previous_set.done
        and previous_set.weight is not null
      order by previous_log.log_date desc, (previous_set.position = set_number.position) desc, previous_set.position desc
      limit 1
    )
  from public.log_exercises exercise
  cross join lateral generate_series(0, exercise.target_sets - 1) as set_number(position)
  where exercise.log_id = v_log_id
    and not exists (select 1 from public.log_sets carried where carried.log_exercise_id = exercise.id);

  return v_log_id;
end;
$$;

-- Returns false if the caller's day has no log.
create or replace function public.save_workout_log(p_date date, p_exercises jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_log_id uuid;
  v_exercise record;
  v_exercise_id uuid;
begin
  select id into v_log_id
  from public.workout_logs
  where user_id = auth.uid()
    and log_date = p_date
  for update;

  if v_log_id is null then
    return false;
  end if;

  delete from public.log_exercises where log_id = v_log_id;

  for v_exercise in
    select value, ordinality - 1 as position
    from jsonb_array_elements(p_exercises) with ordinality
  loop
    insert into public.log_exercises (log_id, position, name, target_sets, target_reps, note)
    values (
      v_log_id,
      v_exercise.position,
      btrim(v_exercise.value ->> 'name'),
      (v_exercise.value ->> 'targetSets')::smallint,
      (v_exercise.value ->> 'targetReps')::smallint,
      coalesce(v_exercise.value ->> 'note', '')
    )
    returning id into v_exercise_id;

    insert into public.log_sets (log_exercise_id, position, reps, weight, done)
    select
      v_exercise_id,
      ordinality - 1,
      (value ->> 'reps')::smallint,
      (value ->> 'weight')::numeric,
      (value ->> 'done')::boolean
    from jsonb_array_elements(v_exercise.value -> 'sets') with ordinality;
  end loop;

  update public.workout_logs set updated_at = now() where id = v_log_id;

  return true;
end;
$$;

create or replace function public.get_workout_log(p_date date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'date', log.log_date,
    'planId', log.plan_id,
    'planName', log.plan_name,
    'exercises', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', exercise.name,
          'targetSets', exercise.target_sets,
          'targetReps', exercise.target_reps,
          'note', exercise.note,
          'sets', coalesce((
            select jsonb_agg(
              jsonb_build_object('reps', logged_set.reps, 'weight', logged_set.weight, 'done', logged_set.done)
              order by logged_set.position
            )
            from public.log_sets logged_set
            where logged_set.log_exercise_id = exercise.id
          ), '[]'::jsonb),
          'previous', (
            select jsonb_build_object(
              'date', previous_log.log_date,
              'sets', (
                select jsonb_agg(
                  jsonb_build_object('reps', previous_set.reps, 'weight', previous_set.weight)
                  order by previous_set.position
                )
                from public.log_sets previous_set
                where previous_set.log_exercise_id = previous_exercise.id and previous_set.done
              )
            )
            from public.log_exercises previous_exercise
            join public.workout_logs previous_log on previous_log.id = previous_exercise.log_id
            where previous_log.user_id = log.user_id
              and lower(previous_exercise.name) = lower(exercise.name)
              and previous_log.log_date < log.log_date
              and exists (
                select 1 from public.log_sets done_set
                where done_set.log_exercise_id = previous_exercise.id and done_set.done
              )
            order by previous_log.log_date desc
            limit 1
          )
        )
        order by exercise.position
      )
      from public.log_exercises exercise
      where exercise.log_id = log.id
    ), '[]'::jsonb)
  )
  from public.workout_logs log
  where log.user_id = auth.uid()
    and log.log_date = p_date;
$$;

create or replace function public.get_exercise_history(p_name text default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', exercise.name,
        'date', log.log_date,
        'planName', log.plan_name,
        'note', exercise.note,
        'sets', done_sets.sets
      )
      order by log.log_date, exercise.position
    ),
    '[]'::jsonb
  )
  from public.log_exercises exercise
  join public.workout_logs log on log.id = exercise.log_id
  cross join lateral (
    select jsonb_agg(jsonb_build_object('reps', logged_set.reps, 'weight', logged_set.weight) order by logged_set.position) as sets
    from public.log_sets logged_set
    where logged_set.log_exercise_id = exercise.id
      and logged_set.done
      and logged_set.reps > 0
  ) done_sets
  where log.user_id = auth.uid()
    and done_sets.sets is not null
    and (p_name is null or lower(exercise.name) = lower(btrim(p_name)));
$$;

-- Callable by signed-in users only. The service role has no auth.uid(), so it's no longer a
-- meaningful caller.
revoke execute on function public.create_workout_plan(text, jsonb) from service_role;
revoke execute on function public.create_workout_log(date, uuid) from service_role;
revoke execute on function public.save_workout_log(date, jsonb) from service_role;
revoke execute on function public.get_workout_log(date) from service_role;
revoke execute on function public.get_exercise_history(text) from service_role;
grant execute on function public.create_workout_plan(text, jsonb) to authenticated;
grant execute on function public.create_workout_log(date, uuid) to authenticated;
grant execute on function public.save_workout_log(date, jsonb) to authenticated;
grant execute on function public.get_workout_log(date) to authenticated;
grant execute on function public.get_exercise_history(text) to authenticated;
