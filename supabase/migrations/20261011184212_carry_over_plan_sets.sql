-- Starting a log from a plan now carries over the last workout from that same plan: each
-- exercise gets that session's sets as they were left (how many, reps and weights), unticked,
-- so a repeat session only needs editing where something went up. Exercises with no earlier
-- session of this plan (the plan's first use, or one done on a later day) keep the old
-- pre-fill: one set per target set, at the target reps and the exercise's last-used weight.
create or replace function public.create_workout_log(p_date date, p_plan_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_log_id uuid;
  v_previous_log_id uuid;
begin
  insert into public.workout_logs (log_date, plan_id, plan_name)
  select p_date, plan.id, plan.name
  from public.workout_plans plan
  where plan.id = p_plan_id
  returning id into v_log_id;

  if v_log_id is null then
    return null;
  end if;

  -- The most recent earlier workout from this plan, if any.
  select previous_log.id into v_previous_log_id
  from public.workout_logs previous_log
  where previous_log.plan_id = p_plan_id
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
  -- the weight used for that set the last time the exercise was done (from any plan).
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
  where exercise.log_id = v_log_id
    and not exists (select 1 from public.log_sets carried where carried.log_exercise_id = exercise.id);

  return v_log_id;
end;
$$;
