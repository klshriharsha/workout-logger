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

The app itself only needs `DATABASE_URL`, a Postgres connection string, in `.env.local` (see
[`.env.example`](../.env.example)). That is enough to run `next dev` against an existing
database. For a hosted project, use the **Transaction pooler** string (Dashboard → Connect,
port 6543): it suits serverless hosts like Vercel, which open many short-lived connections.

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
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

That's the local stack's fixed, well-known database URL, identical on every machine and
unchanged by restarts or `db reset`. It is a local-only dev credential, not a secret.
`pnpm exec supabase status` lists it as *DB URL*.

### Signing in locally

Accounts are email and password, kept in the app's own `public.users` table (sessions in
`public.sessions`); nothing is emailed. Use **Create an account** on the sign-in page with any
address, real or not. A second account is the easiest way to check that two users can't see
each other's data.

To set or reset a password, for example a forgotten one, or one for an account created back
when sign-in was by emailed code (those were carried over without a password), run
`pnpm set-password you@example.com`. It changes the database `DATABASE_URL` points at, and
signs that account out everywhere.

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


### Auth settings

None. The app doesn't use Supabase Auth or send email, so the hosted project needs no Auth,
template or SMTP setup: once the migrations are applied, the app only needs `DATABASE_URL`.

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


