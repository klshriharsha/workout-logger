import { NextResponse } from 'next/server'
import { supabase } from '@/integrations/supabase/client'
import { withErrorHandling } from '@/lib/api-handler'
import { logDateSchema, type LogSummary } from '@/lib/log-schema'

/** GET /api/logs?from=YYYY-MM-DD&to=YYYY-MM-DD — which days in the range (inclusive) have a log. */
export const GET = withErrorHandling(async (request) => {
  const from = logDateSchema.safeParse(request.nextUrl.searchParams.get('from'))
  const to = logDateSchema.safeParse(request.nextUrl.searchParams.get('to'))

  if (!from.success || !to.success) {
    return NextResponse.json({ error: 'from and to must be YYYY-MM-DD dates' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('workout_logs')
    .select('log_date, plan_name')
    .gte('log_date', from.data)
    .lte('log_date', to.data)
    .order('log_date')

  if (error) throw error

  const logs: LogSummary[] = data.map((log) => ({ date: log.log_date, planName: log.plan_name }))

  return NextResponse.json({ logs })
})
