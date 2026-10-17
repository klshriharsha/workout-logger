import { NextResponse } from 'next/server'
import { withUser } from '@/lib/api-handler'
import { logDateSchema, type LogSummary } from '@/lib/log-schema'

/** GET /api/logs?from=YYYY-MM-DD&to=YYYY-MM-DD — which days in the range (inclusive) have a log. */
export const GET = withUser(async (request, _context, db) => {
  const from = logDateSchema.safeParse(request.nextUrl.searchParams.get('from'))
  const to = logDateSchema.safeParse(request.nextUrl.searchParams.get('to'))

  if (!from.success || !to.success) {
    return NextResponse.json({ error: 'from and to must be YYYY-MM-DD dates' }, { status: 400 })
  }

  const logs = await db<LogSummary[]>`
    select log_date as date, plan_name as "planName"
    from public.workout_logs
    where log_date between ${from.data} and ${to.data}
    order by log_date
  `

  return NextResponse.json({ logs })
})
