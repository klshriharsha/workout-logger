import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/integrations/supabase/server'
import { withErrorHandling } from '@/lib/api-handler'
import { verifyCodeSchema } from '@/lib/auth-schema'
import { logger } from '@/lib/logger'

/** POST /api/auth/verify `{ email, code }` — checks the emailed code and starts a session (set as cookies). */
export const POST = withErrorHandling(async (request) => {
  const parsed = verifyCodeSchema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: z.flattenError(parsed.error) }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.code, type: 'email' })

  if (error?.status === 429) {
    return NextResponse.json({ error: 'Too many attempts. Wait a few minutes and try again.' }, { status: 429 })
  }
  // Auth reports a wrong code and an expired one the same way (4xx); either way, the fix is the same.
  if (error && error.status && error.status < 500) {
    return NextResponse.json({ error: 'That code is wrong or has expired' }, { status: 400 })
  }
  if (error) throw error

  logger.info({ userId: data.user?.id }, 'Signed in')

  return new NextResponse(null, { status: 204 })
})
