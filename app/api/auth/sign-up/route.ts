import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withErrorHandling } from '@/lib/api-handler'
import { signUpSchema } from '@/lib/auth-schema'
import { sql } from '@/lib/db'
import { logger } from '@/lib/logger'
import { hashPassword } from '@/lib/password'
import { startSession } from '@/lib/session'

/** POST /api/auth/sign-up `{ email, password }` — creates an account and signs it in. */
export const POST = withErrorHandling(async (request) => {
  const parsed = signUpSchema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: z.flattenError(parsed.error) }, { status: 400 })
  }

  const { email, password } = parsed.data
  const [user] = await sql<{ id: string }[]>`
    insert into public.users (email, password_hash)
    values (${email}, ${await hashPassword(password)})
    on conflict (email) do nothing
    returning id
  `

  if (!user) {
    return NextResponse.json({ error: 'There’s already an account with this email. Sign in instead.' }, { status: 409 })
  }

  await startSession(user.id)
  logger.info({ userId: user.id }, 'Created account')

  return new NextResponse(null, { status: 201 })
})
