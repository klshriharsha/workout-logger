import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/integrations/supabase/server'
import { withErrorHandling } from '@/lib/api-handler'
import { exerciseNameSchema } from '@/lib/plan-schema'
import { buildExerciseHistory, type ExerciseHistoryEntry } from '@/lib/progress'

/** GET /api/history/exercise?name=… — every session of one exercise, or `{ exercise: null }` if it was never done. */
export const GET = withErrorHandling(async (request) => {
  const name = exerciseNameSchema.safeParse(request.nextUrl.searchParams.get('name'))
  if (!name.success) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('get_exercise_history', { p_name: name.data })

  if (error) throw error

  const entries = data as ExerciseHistoryEntry[]

  return NextResponse.json({ exercise: entries.length ? buildExerciseHistory(entries) : null })
})
