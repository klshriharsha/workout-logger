import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/integrations/supabase/server'
import { withErrorHandling } from '@/lib/api-handler'
import { logDateSchema, saveLogSchema, startLogSchema, type WorkoutLog } from '@/lib/log-schema'
import { logger } from '@/lib/logger'

type Context = RouteContext<'/api/logs/[date]'>

const UNIQUE_VIOLATION = '23505'

const invalidDate = () => NextResponse.json({ error: 'Date must be YYYY-MM-DD' }, { status: 400 })

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

async function readLog(supabase: SupabaseClient, date: string) {
  const { data, error } = await supabase.rpc('get_workout_log', { p_date: date })

  if (error) throw error

  return data as WorkoutLog | null
}

/** GET /api/logs/:date — the day's log, or `{ log: null }` if nothing was logged. */
export const GET = withErrorHandling<Context>(async (_request, context) => {
  const date = logDateSchema.safeParse((await context.params).date)
  if (!date.success) return invalidDate()

  const supabase = await createSupabaseServerClient()

  return NextResponse.json({ log: await readLog(supabase, date.data) })
})

/** POST /api/logs/:date `{ planId }` — starts the day's log from a plan. */
export const POST = withErrorHandling<Context>(async (request, context) => {
  const date = logDateSchema.safeParse((await context.params).date)
  if (!date.success) return invalidDate()

  const parsed = startLogSchema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: z.flattenError(parsed.error) }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const { data: id, error } = await supabase.rpc('create_workout_log', { p_date: date.data, p_plan_id: parsed.data.planId })

  if (error?.code === UNIQUE_VIOLATION) {
    return NextResponse.json({ error: 'This day already has a workout' }, { status: 409 })
  }
  if (error) throw error
  if (!id) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

  logger.info({ logId: id, date: date.data, planId: parsed.data.planId }, 'Started workout log')

  return NextResponse.json({ log: await readLog(supabase, date.data) }, { status: 201 })
})

/** PUT /api/logs/:date `{ exercises }` — replaces the day's logged exercises and sets. */
export const PUT = withErrorHandling<Context>(async (request, context) => {
  const date = logDateSchema.safeParse((await context.params).date)
  if (!date.success) return invalidDate()

  const parsed = saveLogSchema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid log', issues: z.flattenError(parsed.error) }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const { data: saved, error } = await supabase.rpc('save_workout_log', {
    p_date: date.data,
    p_exercises: parsed.data.exercises,
  })

  if (error) throw error
  if (!saved) return NextResponse.json({ error: 'No workout logged on this day' }, { status: 404 })

  return new NextResponse(null, { status: 204 })
})

/** DELETE /api/logs/:date — clears the day, so a different plan can be picked. */
export const DELETE = withErrorHandling<Context>(async (_request, context) => {
  const date = logDateSchema.safeParse((await context.params).date)
  if (!date.success) return invalidDate()

  const supabase = await createSupabaseServerClient()
  // Row Level Security limits this to the caller's own log for the day.
  const { error } = await supabase.from('workout_logs').delete().eq('log_date', date.data)

  if (error) throw error

  logger.info({ date: date.data }, 'Deleted workout log')

  return new NextResponse(null, { status: 204 })
})
