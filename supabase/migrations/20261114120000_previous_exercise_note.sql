-- Adds `previousNote` to each exercise in get_workout_log: the latest note left on an exercise
-- with the same name on an earlier day, so it can be read mid-workout without going back to
-- that day. It's looked up separately from `previous` (which only counts sessions with done
-- sets): a note on a skipped session ("shoulder twinge, stopped") or one from a few sessions
-- back (machine settings) is still worth seeing.
--
-- create or replace keeps the existing grants (authenticated only).

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
          ),
          'previousNote', (
            select jsonb_build_object('date', noted_log.log_date, 'note', noted_exercise.note)
            from public.log_exercises noted_exercise
            join public.workout_logs noted_log on noted_log.id = noted_exercise.log_id
            where noted_log.user_id = log.user_id
              and lower(noted_exercise.name) = lower(exercise.name)
              and noted_log.log_date < log.log_date
              and btrim(noted_exercise.note) <> ''
            order by noted_log.log_date desc, noted_exercise.position
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
