-- Editing a plan: renames it and replaces its exercises in one transaction, the same way
-- create_workout_plan writes them. Logs copy a plan's exercises when they're started, so past and
-- in-progress workouts keep the exercises they were started with.
--
-- p_exercises: [{ "name": text, "sets": int, "reps": int }]
-- Returns false if the caller has no such plan.
create function public.update_workout_plan(p_plan_id uuid, p_name text, p_exercises jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.workout_plans
  set name = btrim(p_name)
  where id = p_plan_id
    and user_id = auth.uid();

  if not found then
    return false;
  end if;

  delete from public.plan_exercises where plan_id = p_plan_id;

  insert into public.plan_exercises (plan_id, position, name, sets, reps)
  select
    p_plan_id,
    ordinality - 1,
    btrim(value ->> 'name'),
    (value ->> 'sets')::smallint,
    (value ->> 'reps')::smallint
  from jsonb_array_elements(p_exercises) with ordinality;

  return true;
end;
$$;

revoke execute on function public.update_workout_plan(uuid, text, jsonb) from public, anon, service_role;
grant execute on function public.update_workout_plan(uuid, text, jsonb) to authenticated;
