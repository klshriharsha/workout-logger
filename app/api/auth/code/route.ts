import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/integrations/supabase/server'
import { withErrorHandling } from '@/lib/api-handler'
import { requestCodeSchema } from '@/lib/auth-schema'

/** POST /api/auth/code `{ email }` — emails a sign-in code, creating the account on first use. */
export const POST = withErrorHandling(async (request) => {
  const parsed = requestCodeSchema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email', issues: z.flattenError(parsed.error) }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithOtp({ email: parsed.data.email, options: { shouldCreateUser: true } })

  if (error?.status === 429) {
    return NextResponse.json({ error: 'Too many codes requested. Wait a minute and try again.' }, { status: 429 })
  }
  if (error) throw error

  return new NextResponse(null, { status: 204 })
})
