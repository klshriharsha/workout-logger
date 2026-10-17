-- Workout plans: a named template (e.g. "Upper", "Push") made of ordered exercises, each with
-- the number of sets and the reps per set the user is aiming for. Actual weights and reps are
-- logged separately, against a plan, when a workout is done.

create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);

create table public.plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans (id) on delete cascade,
  position smallint not null check (position >= 0),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  sets smallint not null check (sets between 1 and 20),
  reps smallint not null check (reps between 1 and 1000),
  unique (plan_id, position)
);

-- The app only talks to these tables with the service-role key (which bypasses RLS). Enabling
-- RLS with no policies keeps them closed to the anon/authenticated keys.
alter table public.workout_plans enable row level security;
alter table public.plan_exercises enable row level security;

-- Inserts a plan with all of its exercises in one transaction, so a failure part-way never
-- leaves a half-written plan behind. Input is validated by the API before it gets here; the
-- table constraints above are the backstop.
--
-- p_exercises: [{ "name": text, "sets": int, "reps": int }]
create function public.create_workout_plan(p_name text, p_exercises jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_plan_id uuid;
begin
  insert into public.workout_plans (name)
  values (btrim(p_name))
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

revoke execute on function public.create_workout_plan(text, jsonb) from public, anon, authenticated;
grant execute on function public.create_workout_plan(text, jsonb) to service_role;
