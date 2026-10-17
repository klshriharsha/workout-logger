import { z } from 'zod'
import { MAX_EXERCISES, MAX_REPS, MAX_SETS } from '@/lib/plan-schema'

// Shared by the day view (client) and /api/logs (server). Limits mirror the CHECK constraints
// in supabase/migrations/*_create_workout_logs.sql.

/** A log can go past the plan's sets (extra sets), up to this many per exercise. */
export const MAX_LOGGED_SETS = 30
export const MAX_WEIGHT = 9999.99
export const MAX_NOTE_LENGTH = 500

/** A calendar day, YYYY-MM-DD, in the user's local time. */
export const logDateSchema = z.iso.date()

export const loggedSetSchema = z.object({
  reps: z.int().min(0).max(MAX_REPS),
  // Null for bodyweight sets. Two decimals at most (e.g. 2.5, 1.25 plates).
  weight: z
    .number()
    .min(0)
    .max(MAX_WEIGHT)
    .refine((weight) => Math.abs(weight * 100 - Math.round(weight * 100)) < 1e-6, 'At most two decimals')
    .nullable(),
  done: z.boolean(),
})

export const loggedExerciseSchema = z.object({
  name: z.string().trim().min(1).max(100),
  targetSets: z.int().min(1).max(MAX_SETS),
  targetReps: z.int().min(1).max(MAX_REPS),
  note: z.string().max(MAX_NOTE_LENGTH),
  sets: z.array(loggedSetSchema).max(MAX_LOGGED_SETS),
})

export const saveLogSchema = z.object({
  exercises: z.array(loggedExerciseSchema).max(MAX_EXERCISES),
})

export const startLogSchema = z.object({
  planId: z.uuid(),
})

export type LoggedSet = z.infer<typeof loggedSetSchema>
export type LoggedExercise = z.infer<typeof loggedExerciseSchema>
export type SaveLog = z.infer<typeof saveLogSchema>

/** What was done the last time an exercise with the same name was logged. */
export type PreviousSession = {
  date: string
  sets: { reps: number; weight: number | null }[]
}

export type WorkoutLog = {
  date: string
  planId: string | null
  planName: string
  exercises: (LoggedExercise & { previous: PreviousSession | null })[]
}

export type LogSummary = {
  date: string
  planName: string
}
