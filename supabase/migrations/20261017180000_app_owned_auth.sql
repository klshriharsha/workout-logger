-- Email/password accounts kept in our own tables, replacing Supabase Auth (and the SMTP provider
-- its emailed codes needed).
--
-- The app now connects to Postgres directly. For each request it checks the session cookie
-- against public.sessions, then runs that request's queries in a transaction as the
-- `authenticated` role with the user's id in `request.jwt.claims` (see lib/db.ts). That is
-- exactly what auth.uid() reads, so the Row Level Security policies and functions from
-- 20261017150000_user_owned_data.sql keep working unchanged.

create table public.users (
  id uuid primary key default gen_random_uuid(),
  -- Normalised by the app (trimmed, lower case) before it gets here.
  email text not null unique check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
  -- scrypt, formatted by lib/password.ts. Null for accounts carried over from Supabase Auth,
  -- which never had a password; `pnpm set-password` gives them one.
  password_hash text,
  created_at timestamptz not null default now()
);

create table public.sessions (
  -- SHA-256 of the token in the cookie, so a leaked table can't be replayed as cookies.
  token_hash text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index sessions_user_id_idx on public.sessions (user_id);

-- Only the app's own connection (the table owner) touches these. RLS with no policies, plus no
-- grants, keeps them closed to signed-in users and to Supabase's public API.
alter table public.users enable row level security;
alter table public.sessions enable row level security;
revoke all on public.users, public.sessions from anon, authenticated;

-- Existing accounts keep their ids, so their plans and logs stay theirs.
insert into public.users (id, email)
select id, lower(btrim(email))
from auth.users
where email is not null;

-- Plans and logs now belong to public.users. user_id still defaults to auth.uid(), which is the
-- signed-in user inside a request's transaction.
alter table public.workout_plans drop constraint workout_plans_user_id_fkey;
alter table public.workout_plans
  add constraint workout_plans_user_id_fkey foreign key (user_id) references public.users (id) on delete cascade;

alter table public.workout_logs drop constraint workout_logs_user_id_fkey;
alter table public.workout_logs
  add constraint workout_logs_user_id_fkey foreign key (user_id) references public.users (id) on delete cascade;
