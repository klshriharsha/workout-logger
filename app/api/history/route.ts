import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/integrations/supabase/server'
import { withErrorHandling } from '@/lib/api-handler'
import { buildOverview, type ExerciseHistoryEntry } from '@/lib/progress'

/** GET /api/history — workout days, a summary per exercise and the latest personal records. */
export const GET = withErrorHandling(async () => {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('get_exercise_history')

  if (error) throw error

  return NextResponse.json(buildOverview(data as ExerciseHistoryEntry[]))
})
