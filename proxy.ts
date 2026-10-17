import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { config as env } from '@/lib/config'

// Reachable while signed out. Everything else needs a session.
const PUBLIC_PATHS = ['/sign-in', '/api/auth/', '/api/health']

const isPublic = (pathname: string) =>
  PUBLIC_PATHS.some((path) => (path.endsWith('/') ? pathname.startsWith(path) : pathname === path))

/**
 * Runs before every page and API request: refreshes the Supabase session (writing the new tokens
 * back as cookies) and keeps signed-out visitors on the sign-in page.
 *
 * This is the gate for pages, not the security boundary for data: API routes act as the user,
 * so Row Level Security decides what they can read or change whatever happens here.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        // Refreshed tokens go both ways: onto the request, so this render already sees them, and
        // onto the response, so the browser keeps them.
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
        // No-store headers, so a CDN never hands one user's fresh session to another.
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
      },
    },
  })

  // Verifies the access token (refreshing it if it has expired). Must run before anything else.
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims)
  const { pathname, search } = request.nextUrl

  if (!signedIn && !isPublic(pathname)) {
    if (pathname.startsWith('/api/')) {
      return withCookiesFrom(response, NextResponse.json({ error: 'Sign in to continue' }, { status: 401 }))
    }

    const signIn = new URL('/sign-in', request.url)
    if (pathname !== '/') signIn.searchParams.set('next', pathname + search)
    return withCookiesFrom(response, NextResponse.redirect(signIn))
  }

  if (signedIn && pathname === '/sign-in') {
    return withCookiesFrom(response, NextResponse.redirect(new URL('/', request.url)))
  }

  return response
}

/** Carries any cookies the session refresh set (or cleared) over to a response we return instead. */
function withCookiesFrom(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie)
  return target
}

export const config = {
  // Everything except build assets and the static files the browser fetches for the app shell
  // (icons, manifest), which must load on the sign-in page too.
  matcher: ['/((?!_next/static|_next/image|icons/|apple-touch-icon\\.png|manifest\\.webmanifest|icon\\.svg|favicon\\.ico).*)'],
}
