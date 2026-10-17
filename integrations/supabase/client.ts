import { createClient } from '@supabase/supabase-js'
import { config } from '@/lib/config'

// Service-role key: these run server-side only (Route Handlers) and never ship this client to
// the browser, so bypassing Row Level Security here is intentional rather than a hole to close.
export const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
