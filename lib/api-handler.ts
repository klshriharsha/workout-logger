import { unstable_rethrow } from 'next/navigation'
import { NextResponse, type NextRequest } from 'next/server'
import { logger } from '@/lib/logger'

type RouteHandler<Context> = (request: NextRequest, context: Context) => Promise<Response>

/** Wraps a Route Handler so a thrown/rejected error becomes a logged 500 instead of a crashed request. */
export function withErrorHandling<Context = unknown>(handler: RouteHandler<Context>): RouteHandler<Context> {
  return async (request, context) => {
    try {
      return await handler(request, context)
    } catch (error) {
      // Next.js signals control flow (e.g. bailing out of prerendering) by throwing; let it through.
      unstable_rethrow(error)
      logger.error({ err: error, path: request.nextUrl.pathname }, 'Unhandled request error')

      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}
