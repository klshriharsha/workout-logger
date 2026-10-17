# Workout Logger

Workout Logger is a small web app for planning your training days and logging what you lift.

Set up a plan for each kind of session (upper, lower, push, pull, legs, …). Then, on training day, pick the plan and log each exercise: sets, reps, weight and any notes.

## Features

- **Multiple workout plans**, one per training day.
- **Daily logs** of sets, reps, weights and notes for every exercise.
- **History** of your training: a workout calendar and weekly streak, personal records, and a progress chart (estimated 1RM, top set or reps) for every exercise.
- **Your own account.** Sign in with a code sent to your email; your plans and logs are yours alone.
- **Installable.** Add it to your home screen and use it like a native app at the gym.

## Contributing

**Stack:** Next.js 16 (App Router, Cache Components) · React 19 · TypeScript · Tailwind CSS v4 · Supabase (Postgres) · `zod` · `pino` · pnpm 11. The app is hosted on Vercel, and database migrations run through GitHub Actions.

**Prerequisites:** Node.js 20+, pnpm 11 (`corepack enable`), and Docker for the local Supabase stack.

```bash
pnpm install
cp .env.example .env.local     # fill in the SUPABASE_* values
pnpm exec supabase start       # local Postgres + Studio (Docker)
pnpm exec supabase db reset    # apply migrations + seed
pnpm dev                       # http://localhost:3000
```

Sign in with any email address: locally, the code arrives in Mailpit at http://127.0.0.1:54324.

The local Supabase credentials, the migration workflow and CI deploys are described in [`supabase/README.md`](supabase/README.md).

| Script | Does |
| --- | --- |
| `pnpm dev` | dev server |
| `pnpm build` / `pnpm start` | production build / serve it |
| `pnpm lint` | ESLint |
| `pnpm test:db` | database tests (pgTAP, in `supabase/tests/`), e.g. that users can't see each other's data; needs the local stack running |

**Deploying your own instance:** import the repo into Vercel and set the same env vars there, and set up the hosted project's Auth (email code template, SMTP) as described in [`supabase/README.md`](supabase/README.md#auth-settings-one-time-in-the-dashboard). Add `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID` and `SUPABASE_DB_PASSWORD` as GitHub Action secrets so migrations apply on merge to `main`.
