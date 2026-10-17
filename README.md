# Workout Logger

Workout Logger is a small web app for planning your training days and logging what you lift.

Set up a plan for each kind of session (upper, lower, push, pull, legs, …). Then, on training day, pick the plan and log each exercise: sets, reps, weight and any notes. The log starts from what you did the last time you ran that plan, so you only change what went up:

> **Upper A** · Wed 14 Oct
> Bench press · 3 × 5 · last time 80 kg × 5, 5, 4
> ✓ 80 kg × 5 ✓ 80 kg × 5 ✓ 80 kg × 5
> Pull-up · 3 × 8 · bodyweight
> ✓ 8 ✓ 8 ✓ 7

That way you always know what to beat, and your progress is there to look back on.

## Features

- **Multiple workout plans**, one per training day.
- **Daily logs** of sets, reps, weights and notes for every exercise, pre-filled from the last session of the same plan and saved as you type.
- **History** of your training: a workout calendar and weekly streak, personal records, and a progress chart (estimated 1RM, top set or reps) for every exercise.
- **Your own account.** Sign in with a code sent to your email; your plans and logs are yours alone.
- **Installable.** Add it to your home screen and use it like a native app at the gym.

## How it works

```mermaid
flowchart LR
    subgraph Device["Your phone / browser"]
        UI["Workout Logger app<br/>(PWA)"]
    end

    subgraph Server["Next.js on Vercel"]
        PROXY["proxy.ts<br/>session refresh · sign-in gate"]
        API["API routes<br/>plans · logs · history · auth"]
    end

    subgraph Supabase["Supabase"]
        AUTH["Auth<br/>(email code)"]
        DB[("Postgres<br/>Row Level Security")]
    end

    MAIL["Email provider<br/>(SMTP)"]

    UI -- "every request" --> PROXY
    PROXY --> API
    PROXY -- "verify / refresh session" --> AUTH
    API -- "queries as the signed-in user" --> DB
    API -- "send / verify code" --> AUTH
    AUTH -- "sign-in code" --> MAIL
```

1. You sign in with a 6-digit code sent to your email. The session lives in cookies, which `proxy.ts` refreshes on every request; signed-out visitors are sent to the sign-in page.
2. The API routes query Postgres as the signed-in user, never with an admin key. Row Level Security policies in the database decide which rows each user can read or change, so one user can't see another's plans or logs even if an API route has a bug.
3. Starting a workout copies the plan's exercises and the sets from that plan's last session into a new log, in a single database function. After that, the day view saves your edits automatically.

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
