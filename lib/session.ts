import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { sql } from '@/lib/db'

export const SESSION_COOKIE = 'session'

const SESSION_DAYS = 30
// A session used within this many days of expiring is extended back to the full SESSION_DAYS,
// so anyone who trains at least monthly stays signed in.
const RENEW_WITHIN_DAYS = 15

const DAY_MS = 24 * 60 * 60 * 1000

export type SessionUser = { id: string; email: string }

type Session = { user: SessionUser; expiresAt: Date }

// The cookie holds a random token; the database only ever sees its hash.
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

const expiryFromNow = () => new Date(Date.now() + SESSION_DAYS * DAY_MS)

/** The session cookie for `token`. Not readable from JavaScript, and never sent cross-site on POSTs. */
export const sessionCookie = (token: string, expires: Date) => ({
  name: SESSION_COOKIE,
  value: token,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  expires,
})

/** The live session for a cookie's token, or null if it's missing, unknown or expired. */
export async function findSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null

  const [row] = await sql<{ id: string; email: string; expires_at: Date }[]>`
    select users.id, users.email, sessions.expires_at
    from public.sessions
    join public.users on users.id = sessions.user_id
    where sessions.token_hash = ${hashToken(token)}
      and sessions.expires_at > now()
  `

  return row ? { user: { id: row.id, email: row.email }, expiresAt: row.expires_at } : null
}

/** Pushes a session's expiry back to the full length if it's getting close. Returns the new expiry, if it moved. */
export async function renewSessionIfDue(token: string, session: Session) {
  if (session.expiresAt.getTime() - Date.now() > RENEW_WITHIN_DAYS * DAY_MS) return null

  const expiresAt = expiryFromNow()
  await sql`update public.sessions set expires_at = ${expiresAt} where token_hash = ${hashToken(token)}`

  return expiresAt
}

/** Signs the user in on this device: a new session, set as the cookie. Route Handlers only. */
export async function startSession(userId: string) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = expiryFromNow()

  await sql`
    insert into public.sessions (token_hash, user_id, expires_at)
    values (${hashToken(token)}, ${userId}, ${expiresAt})
  `
  // Housekeeping: the user's long-expired sessions are no use to anyone.
  await sql`delete from public.sessions where user_id = ${userId} and expires_at < now()`

  const cookieStore = await cookies()
  cookieStore.set(sessionCookie(token, expiresAt))
}

/** Signs out this device (other devices stay signed in). Route Handlers only. */
export async function endSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value

  if (token) await sql`delete from public.sessions where token_hash = ${hashToken(token)}`
  cookieStore.delete(SESSION_COOKIE)
}

/** Who's signed in on the current request, or null. */
export async function getSessionUser() {
  const cookieStore = await cookies()

  return (await findSession(cookieStore.get(SESSION_COOKIE)?.value))?.user ?? null
}
