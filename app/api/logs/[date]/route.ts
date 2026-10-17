import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withUser } from '@/lib/api-handler'
import type { UserSql } from '@/lib/db'
import { logDateSchema, saveLogSchema, startLogSchema, type WorkoutLog } from '@/lib/log-schema'
import { logger } from '@/lib/logger'

type Context = RouteContext<'/api/logs/[date]'>

const UNIQUE_VIOLATION = '23505'

const invalidDate = () => NextResponse.json({ error: 'Date must be YYYY-MM-DD' }, { status: 400 })

async function readLog(db: UserSql, date: string) {
  const [{ log }] = await db<{ log: WorkoutLog | null }[]>`select public.get_workout_log(${date}) as log`

  return log
}

/** GET /api/logs/:date — the day's log, or `{ log: null }` if nothing was logged. */
export const GET = withUser<Context>(async (_request, context, db) => {
  const date = logDateSchema.safeParse((await context.params).date)
  if (!date.success) return invalidDate()

  return NextResponse.json({ log: await readLog(db, date.data) })
})

/** POST /api/logs/:date `{ planId }` — starts the day's log from a plan. */
export const POST = withUser<Context>(async (request, context, db) => {
  const date = logDateSchema.safeParse((await context.params).date)
  if (!date.success) return invalidDate()

  const parsed = startLogSchema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: z.flattenError(parsed.error) }, { status: 400 })
  }

  let id: string | null
  try {
    // A savepoint, so the transaction is still usable if the day already has a log.
    ;[{ id }] = await db.savepoint(
      (sp) => sp<{ id: string | null }[]>`select public.create_workout_log(${date.data}, ${parsed.data.planId}) as id`,
    )
  } catch (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      return NextResponse.json({ error: 'This day already has a workout' }, { status: 409 })
    }
    throw error
  }
  if (!id) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

  logger.info({ logId: id, date: date.data, planId: parsed.data.planId }, 'Started workout log')

  return NextResponse.json({ log: await readLog(db, date.data) }, { status: 201 })
})

/** PUT /api/logs/:date `{ exercises }` — replaces the day's logged exercises and sets. */
export const PUT = withUser<Context>(async (request, context, db) => {
  const date = logDateSchema.safeParse((await context.params).date)
  if (!date.success) return invalidDate()

  const parsed = saveLogSchema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid log', issues: z.flattenError(parsed.error) }, { status: 400 })
  }

  const [{ saved }] = await db<{ saved: boolean }[]>`
    select public.save_workout_log(${date.data}, ${db.json(parsed.data.exercises)}) as saved
  `

  if (!saved) return NextResponse.json({ error: 'No workout logged on this day' }, { status: 404 })

  return new NextResponse(null, { status: 204 })
})

/** DELETE /api/logs/:date — clears the day, so a different plan can be picked. */
export const DELETE = withUser<Context>(async (_request, context, db) => {
  const date = logDateSchema.safeParse((await context.params).date)
  if (!date.success) return invalidDate()

  // Row Level Security limits this to the caller's own log for the day.
  await db`delete from public.workout_logs where log_date = ${date.data}`

  logger.info({ date: date.data }, 'Deleted workout log')

  return new NextResponse(null, { status: 204 })
})
