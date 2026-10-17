# Database & migrations

The database is Postgres, hosted on Supabase. Its schema is defined entirely by the
timestamped SQL files in [`migrations/`](./migrations) — the repo is the source of truth, and
the hosted database is only ever changed by replaying those files through the Supabase CLI.

> **Golden rule:** never edit the schema by hand in the Supabase dashboard or `psql`. Every
> change is a new migration file, reviewed in a PR, applied by CI. A hand edit makes
> `supabase db push` fail with a history-mismatch error for everyone.

The CLI ships as a dev dependency, so there is nothing to install globally — every command below is wrapped in `pnpm exec`.

---

## One-time setup

### 1. Environment

The app itself needs `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `.env.local` (see
[`.env.example`](../.env.example)). That is enough to run `next dev` against an existing
database.

The migration tooling additionally needs a **Supabase access token** so it can talk to the
hosted project:

```bash
pnpm exec supabase login   # opens a browser, stores the token in your OS keychain
```

### 2. Pick how you run migrations locally

Two supported workflows — choose one:


|                                 | **A. Full local stack** (recommended)    | **B. Hosted dev project** (no Docker) |
| ------------------------------- | ---------------------------------------- | ------------------------------------- |
| Needs Docker                    | yes                                      | no                                    |
| Needs a second Supabase project | no                                       | yes (a free "…-dev" project)          |
| DB you develop against          | throwaway container on `localhost:54322` | a real hosted dev DB                  |
| Reset to a clean state          | `pnpm exec supabase db reset` (instant)  | not really — it is a shared remote    |


---

## Workflow A — full local stack (Docker)

```bash
pnpm exec supabase start            # boots Postgres + Studio in Docker (first run pulls images)
pnpm exec supabase db reset         # drops the local DB, replays every migration, then runs seed.sql
```

Point `.env.local` at the local stack while developing:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
```

With no custom `jwt_secret`, the stack uses the Supabase CLI's built-in default keys: the
key above is fixed and well-known, identical on every machine and unchanged by restarts or
`db reset`. It is a local-only dev credential, not a secret. `pnpm exec supabase status`
(add `-o env` for env format) lists it.

### Signing in locally

Sign-in is by emailed code (Supabase Auth, configured under `[auth]` in `config.toml`). The
local stack never sends real email: every message lands in Mailpit at
[http://127.0.0.1:54324](http://127.0.0.1:54324). Sign in with any address, open Mailpit, and
type the 6-digit code it shows. A new address creates a new, empty account, which is the
easiest way to check that two users can't see each other's data.

Studio (table browser, SQL editor) runs at [http://127.0.0.1:54323](http://127.0.0.1:54323). `pnpm exec supabase stop` shuts the stack down; data survives between `start`/`stop` until you `pnpm exec supabase db reset` or `pnpm exec supabase stop --no-backup`.

### Making a schema change

```bash
pnpm exec supabase migration new add_rest_timer_column   # creates migrations/<timestamp>_add_rest_timer_column.sql
$EDITOR supabase/migrations/<timestamp>_add_rest_timer_column.sql
pnpm exec supabase db reset                          # verify it applies cleanly from scratch + seed
```

Prefer hand-writing the SQL. If you changed the schema through Studio while exploring, capture
the delta instead of retyping it:

```bash
pnpm exec supabase db diff -f add_rest_timer_column   # writes the diff to a new migration file
```

Commit the new file. That is the whole change.

---

## Workflow B — hosted dev project (no Docker)

Create a second, free Supabase project (e.g. `workout-logger-dev`) and use it as your scratch
database. Apply migrations to it with:

```bash
pnpm exec supabase link --project-ref <dev-project-ref>
pnpm exec supabase db push          # applies any migrations the dev DB is missing
```

Create new migrations the same way as workflow A (`pnpm exec supabase migration new …`, edit
the file), then `pnpm exec supabase db push` to try them on the dev DB.
`pnpm exec supabase db reset` and `pnpm exec supabase db diff` are not available without
Docker — write the SQL by hand and rely on the CI dry-run for a second pair of eyes.

Keep `link` pointed at the **dev** project on your machine. Production is only ever touched
by CI (below).

---

## Production deploys (CI)

`.github/workflows/db-migrations.yml` owns production:

- **PR that touches `supabase/**`** → `supabase db push --dry-run`, which prints exactly which migrations would run in
the check logs. Nothing is applied.
- **Merge to `main`** → `supabase db push` applies every pending migration to the production
project.
- **Manual run** (Actions tab → "Database migrations" → Run workflow) → same as a merge to
`main`. Use this once to bootstrap a freshly created production project (its schema starts
empty, and the path filters above only fire when a migration file itself changes).

It needs three repository secrets (Settings → Secrets and variables → Actions):


| Secret                  | Where to get it                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | [https://supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) |
| `SUPABASE_PROJECT_ID`   | project ref — the `<ref>` in `https://<ref>.supabase.co`                                       |
| `SUPABASE_DB_PASSWORD`  | Dashboard → Settings → Database → Database password                                            |


### Auth settings (one-time, in the dashboard)

`config.toml` only configures the local stack, and CI only pushes migrations, so the hosted
project's Auth settings are set by hand (Dashboard → Authentication):

- **Sign In / Providers → Email:** enabled, with *Email OTP Length* at **6** (it must match
  `SIGN_IN_CODE_LENGTH` in `lib/auth-schema.ts`) and *Email OTP Expiration* at **600** seconds.
- **Emails → Templates:** paste `supabase/templates/sign-in-code.html` into both **Magic Link**
  and **Confirm signup** (subject: "Your Workout Logger sign-in code"). The default templates
  send a link, not the code, and the app has nowhere for that link to land.
- **URL Configuration → Site URL:** the production URL.
- **Emails → SMTP Settings:** a real email provider. Supabase's built-in sender only delivers
  to the project's team members and a handful of messages an hour, so nobody else could sign
  in without one.

---

## Cheat sheet


| Command                                                | Does                                                 |
| ------------------------------------------------------ | ---------------------------------------------------- |
| `pnpm exec supabase start` / `pnpm exec supabase stop` | boot / stop the local Docker stack                   |
| `pnpm exec supabase status` (`-o env` for env format) | show local stack URLs and keys                       |
| `pnpm exec supabase migration new <name>`              | create an empty timestamped migration                |
| `pnpm exec supabase db diff -f <name>`                 | write local schema drift into a new migration        |
| `pnpm exec supabase db reset`                          | rebuild local DB from migrations + `seed.sql`        |
| `pnpm exec supabase migration up`                      | apply only not-yet-applied migrations locally        |
| `pnpm exec supabase migration list`                    | show local vs remote migration status (needs `link`) |
| `pnpm exec supabase db lint`                           | static-check migration SQL                           |
| `pnpm exec supabase db push`                           | apply pending migrations to the linked project       |


