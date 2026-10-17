# Database & migrations

The database is Postgres, hosted on Supabase. Its schema is defined entirely by the
timestamped SQL files in [`migrations/`](./migrations) — the repo is the source of truth, and
the hosted database is only ever changed by replaying those files through the Supabase CLI.

> **Golden rule:** never edit the schema by hand in the Supabase dashboard or `psql`. Every
> change is a new migration file, reviewed in a PR, applied by CI. A hand edit makes
> `supabase db push` fail with a history-mismatch error for everyone.

The CLI ships as a dev dependency, so there is nothing to install globally — every command below is wrapped in a `pnpm exec` .

---

## One-time setup

### 1. Environment

The app itself needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (see
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
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
```

`config.toml` disables Supabase Auth (`[auth] enabled = false`), so `supabase status` prints
only URLs — no API key. And with no custom `jwt_secret`, the stack uses the Supabase CLI's
built-in default keys: the `service_role` JWT above is a fixed, well-known value, identical on
every machine and unchanged by restarts or `db reset`. It is a local-only dev credential, not
a secret. (If you ever enable `[auth]`, `pnpm exec supabase status` — add `-o env` for env
format — will list the keys instead.)

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

- **PR that touches `supabase/**`** → `supabase db push --dry-run` comments-worthy output in
the check logs: exactly which migrations would run. Nothing is applied.
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


---

## Cheat sheet


| Command                                                | Does                                                 |
| ------------------------------------------------------ | ---------------------------------------------------- |
| `pnpm exec supabase start` / `pnpm exec supabase stop` | boot / stop the local Docker stack                   |
| `pnpm exec supabase status` (`-o env` for env format) | show local stack URLs (keys too, if `[auth]` is on)  |
| `pnpm exec supabase migration new <>`                  | create an empty timestamped migration                |
| `pnpm exec supabase db diff -f <>`                     | write local schema drift into a new migration        |
| `pnpm exec supabase db reset`                          | rebuild local DB from migrations + `seed.sql`        |
| `pnpm exec supabase migration up`                      | apply only not-yet-applied migrations locally        |
| `pnpm exec supabase migration list`                    | show local vs remote migration status (needs `link`) |
| `pnpm exec supabase db lint`                           | static-check migration SQL                           |
| `pnpm exec supabase db push`                           | apply pending migrations to the linked project       |


