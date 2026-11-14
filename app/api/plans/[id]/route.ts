import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withUser } from '@/lib/api-handler'
import { logger } from '@/lib/logger'
import { createPlanSchema, planIdSchema, type Plan } from '@/lib/plan-schema'

type Context = RouteContext<'/api/plans/[id]'>

// A malformed id can't name one of the caller's plans, so it gets the same answer as a missing one.
const notFound = () => NextResponse.json({ error: 'Plan not found' }, { status: 404 })

/** GET /api/plans/:id — the plan with its exercises, in order. */
export const GET = withUser<Context>(async (_request, context, db) => {
  const id = planIdSchema.safeParse((await context.params).id)
  if (!id.success) return notFound()

  // Row Level Security limits this to the caller's own plans.
  const [plan] = await db<Plan[]>`
    select
      plan.id,
      plan.name,
      coalesce(
        jsonb_agg(jsonb_build_object('name', exercise.name, 'sets', exercise.sets, 'reps', exercise.reps) order by exercise.position)
          filter (where exercise.id is not null),
        '[]'::jsonb
      ) as exercises
    from public.workout_plans plan
    left join public.plan_exercises exercise on exercise.plan_id = plan.id
    where plan.id = ${id.data}
    group by plan.id
  `
  if (!plan) return notFound()

  return NextResponse.json({ plan })
})

/** PUT /api/plans/:id `{ name, exercises }` — renames the plan and replaces its exercises. */
export const PUT = withUser<Context>(async (request, context, db) => {
  const id = planIdSchema.safeParse((await context.params).id)
  if (!id.success) return notFound()

  const parsed = createPlanSchema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid plan', issues: z.flattenError(parsed.error) }, { status: 400 })
  }

  const { name, exercises } = parsed.data
  const [{ updated }] = await db<{ updated: boolean }[]>`
    select public.update_workout_plan(${id.data}, ${name}, ${db.json(exercises)}) as updated
  `
  if (!updated) return notFound()

  logger.info({ planId: id.data, exercises: exercises.length }, 'Updated workout plan')

  return new NextResponse(null, { status: 204 })
})
