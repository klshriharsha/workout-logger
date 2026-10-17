import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandling } from '@/lib/api-handler'
import { signInSchema } from '@/lib/auth-schema'
import { sql } from '@/lib/db'
import { logger } from '@/lib/logger'
import { verifyPassword } from '@/lib/password'
import { startSession } from '@/lib/session'

/** POST /api/auth/sign-in `{ email, password }` — checks the password and starts a session (set as a cookie). */
export const POST = withErrorHandling(async (request) => {
  const parsed = signInSchema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: z.flattenError(parsed.error) }, { status: 400 })
  }

  const { email, password } = parsed.data
  const [user] = await sql<{ id: string; password_hash: string | null }[]>`
    select id, password_hash from public.users where email = ${email}
  `

  // The same answer for an unknown email and a wrong password, so this can't be used to find accounts.
  if (!(await verifyPassword(password, user?.password_hash))) {
    return NextResponse.json({ error: 'Wrong email or password' }, { status: 400 })
  }

  await startSession(user.id)
  logger.info({ userId: user.id }, 'Signed in')

  return new NextResponse(null, { status: 204 })
})
