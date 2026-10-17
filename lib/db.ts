import postgres, { type TransactionSql } from 'postgres'
import { config } from '@/lib/config'

export type UserSql = TransactionSql

const globalForDb = globalThis as unknown as { sql?: postgres.Sql }

/**
 * The app's connection pool. It connects as the database owner, so it bypasses Row Level Security:
 * use it directly only for accounts and sessions, and reach workout data through `asUser`.
 *
 * `prepare: false` keeps it working through a transaction-mode pooler (Supabase's port 6543),
 * which is what a serverless host should connect to.
 */
export const sql =
  globalForDb.sql ??
  postgres(config.DATABASE_URL, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    // Return `date` columns as the YYYY-MM-DD strings the API speaks, not as JS Dates.
    types: { date: { to: 1082, from: [1082], serialize: (value: string) => value, parse: (value: string) => value } },
  })

// Next.js dev reloads modules on every edit; reuse one pool instead of leaking a new one each time.
if (process.env.NODE_ENV !== 'production') globalForDb.sql = sql

/**
 * Runs `work` in a transaction that acts as the signed-in user: the `authenticated` role, with the
 * user's id where auth.uid() reads it. Row Level Security then limits every query to their rows,
 * whatever the query says.
 */
export function asUser<T>(userId: string, work: (tx: UserSql) => Promise<T>) {
  return sql.begin(async (tx) => {
    await tx`
      select set_config('role', 'authenticated', true),
             set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)
    `
    return work(tx)
  }) as Promise<T>
}
