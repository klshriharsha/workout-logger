import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { config } from '@/lib/config'

/**
 * A client that acts as the signed-in user, from the session cookies on the current request, so
 * Row Level Security applies. Create one per request: it holds that request's cookies.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
        } catch {
          // Server Components can't set cookies. That's fine: the proxy has already refreshed the
          // session for this request, and Route Handlers (where sign-in happens) can set them.
        }
      },
    },
  })
}
