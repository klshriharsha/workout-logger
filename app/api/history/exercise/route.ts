import { NextResponse } from 'next/server'
import { withUser } from '@/lib/api-handler'
import { exerciseNameSchema } from '@/lib/plan-schema'
import { buildExerciseHistory, type ExerciseHistoryEntry } from '@/lib/progress'

/** GET /api/history/exercise?name=… — every session of one exercise, or `{ exercise: null }` if it was never done. */
export const GET = withUser(async (request, _context, db) => {
  const name = exerciseNameSchema.safeParse(request.nextUrl.searchParams.get('name'))
  if (!name.success) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const [{ entries }] = await db<{ entries: ExerciseHistoryEntry[] }[]>`
    select public.get_exercise_history(${name.data}) as entries
  `

  return NextResponse.json({ exercise: entries.length ? buildExerciseHistory(entries) : null })
})
