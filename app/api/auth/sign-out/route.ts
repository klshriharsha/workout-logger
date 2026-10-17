import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/integrations/supabase/server'
import { withErrorHandling } from '@/lib/api-handler'

/** POST /api/auth/sign-out — ends the session on this device (others stay signed in). */
export const POST = withErrorHandling(async () => {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signOut({ scope: 'local' })

  if (error) throw error

  return new NextResponse(null, { status: 204 })
})
