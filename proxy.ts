import { NextResponse, type NextRequest } from 'next/server'
import { findSession, renewSessionIfDue, SESSION_COOKIE, sessionCookie } from '@/lib/session'

// Reachable while signed out. Everything else needs a session.
const PUBLIC_PATHS = ['/sign-in', '/api/auth/', '/api/health']

const isPublic = (pathname: string) =>
  PUBLIC_PATHS.some((path) => (path.endsWith('/') ? pathname.startsWith(path) : pathname === path))

/**
 * Runs before every page and API request: keeps signed-out visitors on the sign-in page, and
 * extends the session of anyone who's still using it (rewriting the cookie with the new expiry).
 *
 * This is the gate for pages, not the security boundary for data: API routes check the session
 * themselves and act as the user, so Row Level Security decides what they can read or change
 * whatever happens here.
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = await findSession(token)
  const { pathname, search } = request.nextUrl

  if (!session && !isPublic(pathname)) {
    const response = pathname.startsWith('/api/')
      ? NextResponse.json({ error: 'Sign in to continue' }, { status: 401 })
      : NextResponse.redirect(signInUrl(request, pathname + search))
    // A cookie for a session that's gone (expired, or signed out elsewhere) is no use; drop it.
    if (token) response.cookies.delete(SESSION_COOKIE)
    return response
  }

  if (session && pathname === '/sign-in') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const response = NextResponse.next()
  if (session && token) {
    const expiresAt = await renewSessionIfDue(token, session)
    if (expiresAt) response.cookies.set(sessionCookie(token, expiresAt))
  }

  return response
}

function signInUrl(request: NextRequest, next: string) {
  const url = new URL('/sign-in', request.url)
  if (next !== '/') url.searchParams.set('next', next)
  return url
}

export const config = {
  // Everything except build assets and the static files the browser fetches for the app shell
  // (icons, manifest), which must load on the sign-in page too.
  matcher: ['/((?!_next/static|_next/image|icons/|apple-touch-icon\\.png|manifest\\.webmanifest|icon\\.svg|favicon\\.ico).*)'],
}
