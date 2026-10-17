import { NextResponse } from 'next/server'
import { withUser } from '@/lib/api-handler'
import { buildOverview, type ExerciseHistoryEntry } from '@/lib/progress'

/** GET /api/history — workout days, a summary per exercise and the latest personal records. */
export const GET = withUser(async (_request, _context, db) => {
  const [{ history }] = await db<{ history: ExerciseHistoryEntry[] }[]>`select public.get_exercise_history() as history`

  return NextResponse.json(buildOverview(history))
})
