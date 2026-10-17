import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/integrations/supabase/client'
import { withErrorHandling } from '@/lib/api-handler'
import { logger } from '@/lib/logger'
import { createPlanSchema, type PlanSummary } from '@/lib/plan-schema'

export const GET = withErrorHandling(async () => {
  const { data, error } = await supabase
    .from('workout_plans')
    .select('id, name, created_at, plan_exercises(sets)')
    .order('created_at', { ascending: false })

  if (error) throw error

  const plans: PlanSummary[] = data.map((plan) => ({
    id: plan.id,
    name: plan.name,
    createdAt: plan.created_at,
    exerciseCount: plan.plan_exercises.length,
    setCount: plan.plan_exercises.reduce((total, exercise) => total + exercise.sets, 0),
  }))

  return NextResponse.json({ plans })
})

export const POST = withErrorHandling(async (request) => {
  const body = await request.json().catch(() => undefined)
  const parsed = createPlanSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid plan', issues: z.flattenError(parsed.error) }, { status: 400 })
  }

  const { name, exercises } = parsed.data
  const { data: id, error } = await supabase.rpc('create_workout_plan', { p_name: name, p_exercises: exercises })

  if (error) throw error

  logger.info({ planId: id, exercises: exercises.length }, 'Created workout plan')

  return NextResponse.json({ id }, { status: 201 })
})
