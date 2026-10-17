import { unstable_rethrow } from 'next/navigation'
import { NextResponse, type NextRequest } from 'next/server'
import { asUser, type UserSql } from '@/lib/db'
import { logger } from '@/lib/logger'
import { findSession, SESSION_COOKIE } from '@/lib/session'

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

type UserRouteHandler<Context> = (request: NextRequest, context: Context, db: UserSql) => Promise<Response>

/**
 * Like `withErrorHandling`, for routes that need a signed-in user: answers 401 without a valid
 * session, and otherwise runs the handler in a transaction acting as that user (see `asUser`), so
 * Row Level Security limits `db` to their own rows.
 */
export function withUser<Context = unknown>(handler: UserRouteHandler<Context>): RouteHandler<Context> {
  return withErrorHandling(async (request, context) => {
    const session = await findSession(request.cookies.get(SESSION_COOKIE)?.value)
    if (!session) return NextResponse.json({ error: 'Sign in to continue' }, { status: 401 })

    return asUser(session.user.id, (db) => handler(request, context, db))
  })
}
