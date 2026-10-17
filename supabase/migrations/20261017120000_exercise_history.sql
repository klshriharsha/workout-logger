-- History of every exercise, for the History tab: one entry per exercise per workout, with the
-- sets that were ticked off. Exercises are matched across logs by name, case-insensitively, the
-- same way "last time" lookups are. Sets that were pre-filled but never done, and done sets saved
-- with blank reps (0), aren't history, and an exercise with none left is left out.
--
-- p_name: only this exercise (any case), or null for all of them.
--
-- Returns [{ "name", "date", "planName", "note", "sets": [{ "reps", "weight" }] }], oldest first.
create function public.get_exercise_history(p_name text default null)
returns jsonb
language sql
stable
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
  where done_sets.sets is not null
    and (p_name is null or lower(exercise.name) = lower(btrim(p_name)));
$$;

revoke execute on function public.get_exercise_history(text) from public, anon, authenticated;
grant execute on function public.get_exercise_history(text) to service_role;
