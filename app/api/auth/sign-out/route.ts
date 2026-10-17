import { NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/api-handler'
import { endSession } from '@/lib/session'

/** POST /api/auth/sign-out — ends the session on this device (others stay signed in). */
export const POST = withErrorHandling(async () => {
  await endSession()

  return new NextResponse(null, { status: 204 })
})
