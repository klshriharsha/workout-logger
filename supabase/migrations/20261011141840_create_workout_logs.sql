-- Workout logs: what was actually done on a given day. A log is started from a plan, and the
-- plan's exercises are copied into it (with their targets). From then on the log is
-- independent: extra sets, changed reps or a renamed plan never flow back into the plan, and
-- editing a plan later never rewrites history.

create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  -- The user's local calendar day. One workout per day.
  log_date date not null unique,
  -- Kept as a link for "logs from this plan"; plan_name is the snapshot shown in the UI.
  plan_id uuid references public.workout_plans (id) on delete set null,
  plan_name text not null check (char_length(btrim(plan_name)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.log_exercises (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.workout_logs (id) on delete cascade,
  position smallint not null check (position >= 0),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  -- The plan's targets at the time the log was started.
  target_sets smallint not null check (target_sets between 1 and 20),
  target_reps smallint not null check (target_reps between 1 and 1000),
  note text not null default '' check (char_length(note) <= 500),
  unique (log_id, position)
);

-- "Last time" lookups match exercises across logs by name.
create index log_exercises_lower_name_idx on public.log_exercises (lower(name));

create table public.log_sets (
  id uuid primary key default gen_random_uuid(),
  log_exercise_id uuid not null references public.log_exercises (id) on delete cascade,
  position smallint not null check (position >= 0),
  reps smallint not null check (reps between 0 and 1000),
  -- Null for bodyweight sets.
  weight numeric(6, 2) check (weight >= 0 and weight < 10000),
  -- Sets are pre-filled from the plan; only the ones ticked off were actually performed.
  done boolean not null default false,
  unique (log_exercise_id, position)
);

-- Same as the plan tables: service-role only.
alter table public.workout_logs enable row level security;
alter table public.log_exercises enable row level security;
alter table public.log_sets enable row level security;

-- Starts the log for p_date from a plan: copies its exercises and creates one set per target
-- set, pre-filled with the target reps and the weight used for that set the last time the
-- exercise was done. Returns null if the plan doesn't exist; raises unique_violation if the
-- day already has a log.
create function public.create_workout_log(p_date date, p_plan_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_log_id uuid;
begin
  insert into public.workout_logs (log_date, plan_id, plan_name)
  select p_date, plan.id, plan.name
  from public.workout_plans plan
  where plan.id = p_plan_id
  returning id into v_log_id;

  if v_log_id is null then
    return null;
  end if;

  insert into public.log_exercises (log_id, position, name, target_sets, target_reps)
  select v_log_id, exercise.position, exercise.name, exercise.sets, exercise.reps
  from public.plan_exercises exercise
  where exercise.plan_id = p_plan_id;

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
      where lower(previous_exercise.name) = lower(exercise.name)
        and previous_log.log_date < p_date
        and previous_set.done
        and previous_set.weight is not null
      order by previous_log.log_date desc, (previous_set.position = set_number.position) desc, previous_set.position desc
      limit 1
    )
  from public.log_exercises exercise
  cross join lateral generate_series(0, exercise.target_sets - 1) as set_number(position)
  where exercise.log_id = v_log_id;

  return v_log_id;
end;
$$;

-- Replaces the exercises and sets of the log for p_date with p_exercises, in one transaction.
-- The client always sends the whole log, so a save is idempotent and the last write wins.
-- Returns false if the day has no log.
--
-- p_exercises: [{ "name", "targetSets", "targetReps", "note", "sets": [{ "reps", "weight", "done" }] }]
create function public.save_workout_log(p_date date, p_exercises jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_log_id uuid;
  v_exercise record;
  v_exercise_id uuid;
begin
  select id into v_log_id
  from public.workout_logs
  where log_date = p_date
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

-- The log for p_date as one JSON document (null if there is none). Each exercise carries
-- `previous`: the sets done the last time an exercise with the same name was logged.
create function public.get_workout_log(p_date date)
returns jsonb
language sql
stable
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
            where lower(previous_exercise.name) = lower(exercise.name)
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
  where log.log_date = p_date;
$$;

revoke execute on function public.create_workout_log(date, uuid) from public, anon, authenticated;
revoke execute on function public.save_workout_log(date, jsonb) from public, anon, authenticated;
revoke execute on function public.get_workout_log(date) from public, anon, authenticated;
grant execute on function public.create_workout_log(date, uuid) to service_role;
grant execute on function public.save_workout_log(date, jsonb) to service_role;
grant execute on function public.get_workout_log(date) to service_role;
