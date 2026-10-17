import { z } from 'zod'

// Shared by the plan form (client) and POST /api/plans (server). Limits mirror the CHECK
// constraints in supabase/migrations/*_create_workout_plans.sql.

export const MAX_EXERCISES = 30
export const MAX_SETS = 20
export const MAX_REPS = 1000

export const exerciseNameSchema = z.string().trim().min(1, 'Exercise name is required').max(100, 'Exercise name is too long')

export const planExerciseSchema = z.object({
  name: exerciseNameSchema,
  sets: z
    .int({ error: (issue) => (issue.input === undefined ? 'Sets are required' : 'Sets must be a whole number') })
    .min(1, 'At least 1 set')
    .max(MAX_SETS, `At most ${MAX_SETS} sets`),
  reps: z
    .int({ error: (issue) => (issue.input === undefined ? 'Reps are required' : 'Reps must be a whole number') })
    .min(1, 'At least 1 rep')
    .max(MAX_REPS, `At most ${MAX_REPS} reps`),
})

export const createPlanSchema = z.object({
  name: z.string().trim().min(1, 'Plan name is required').max(100, 'Plan name is too long'),
  exercises: z
    .array(planExerciseSchema)
    .min(1, 'Add at least one exercise')
    .max(MAX_EXERCISES, `At most ${MAX_EXERCISES} exercises`),
})

export type CreatePlanInput = z.input<typeof createPlanSchema>
export type CreatePlan = z.output<typeof createPlanSchema>

export type PlanSummary = {
  id: string
  name: string
  createdAt: string
  exerciseCount: number
  setCount: number
}
