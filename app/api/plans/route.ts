import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withUser } from '@/lib/api-handler'
import { logger } from '@/lib/logger'
import { createPlanSchema, type PlanSummary } from '@/lib/plan-schema'

export const GET = withUser(async (_request, _context, db) => {
  const plans = await db<PlanSummary[]>`
    select
      plan.id,
      plan.name,
      plan.created_at as "createdAt",
      count(exercise.id)::int as "exerciseCount",
      coalesce(sum(exercise.sets), 0)::int as "setCount"
    from public.workout_plans plan
    left join public.plan_exercises exercise on exercise.plan_id = plan.id
    group by plan.id
    order by plan.created_at desc
  `

  return NextResponse.json({ plans })
})

export const POST = withUser(async (request, _context, db) => {
  const body = await request.json().catch(() => undefined)
  const parsed = createPlanSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid plan', issues: z.flattenError(parsed.error) }, { status: 400 })
  }

  const { name, exercises } = parsed.data
  const [{ id }] = await db<{ id: string }[]>`select public.create_workout_plan(${name}, ${db.json(exercises)}) as id`

  logger.info({ planId: id, exercises: exercises.length }, 'Created workout plan')

  return NextResponse.json({ id }, { status: 201 })
})
