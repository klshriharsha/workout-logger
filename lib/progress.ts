import { addDays, startOfWeek } from '@/lib/dates'

// Progress metrics for the History tab. Everything is computed from the sets that were ticked
// off (see get_exercise_history in supabase/migrations/*_exercise_history.sql), on the server for
// the API and in the browser for anything that depends on the user's local "today". Weights are kg.

export type HistorySet = { reps: number; weight: number | null }

/** One exercise in one workout, as returned by get_exercise_history. */
export type ExerciseHistoryEntry = {
  name: string
  date: string
  planName: string
  note: string
  sets: HistorySet[]
}

/**
 * - weight: heaviest weight ever lifted
 * - e1rm: best estimated one-rep max
 * - repsAtWeight: more reps than ever before at this weight or heavier
 * - reps: most reps in a set (bodyweight exercises)
 */
export type RecordKind = 'weight' | 'e1rm' | 'repsAtWeight' | 'reps'

export type PersonalRecord = { kind: RecordKind; set: HistorySet }

export type ExerciseSession = {
  date: string
  planName: string
  note: string
  sets: HistorySet[]
  /** The heaviest set (most reps breaking a tie), or the set with the most reps if none had weight. */
  topSet: HistorySet
  /** The session's best estimated 1RM; null if no set had weight. */
  e1rm: number | null
  /** The bests this session beat. Always empty for the first session: there was nothing to beat. */
  records: PersonalRecord[]
}

export type ExerciseKind = 'weighted' | 'bodyweight'

export type ExerciseHistory = {
  name: string
  /** Weighted if a set was ever done with weight; bodyweight exercises progress in reps. */
  kind: ExerciseKind
  /** Oldest first. */
  sessions: ExerciseSession[]
  /** Best-ever sets, with the day they were done. */
  bests: {
    heaviest: { set: HistorySet; date: string } | null
    e1rm: { set: HistorySet; value: number; date: string } | null
    mostReps: { set: HistorySet; date: string }
  }
  /**
   * The heaviest weight done for each rep count, leaving out rep counts that a heavier set with
   * more reps beat (if 100×5 was done, a best of 95×3 says nothing). Fewest reps first.
   */
  repMaxes: { reps: number; weight: number; date: string }[]
}

export type ExerciseSummary = {
  name: string
  kind: ExerciseKind
  sessionCount: number
  lastDate: string
  lastTopSet: HistorySet
  /** Best estimated 1RM (weighted) or most reps in a set (bodyweight). */
  best: number
  /** The last session against the one before, on the same measure as `best`. Null with one session. */
  trend: 'up' | 'down' | 'flat' | null
}

export type WorkoutDay = { date: string; planName: string }

/** Workouts that set at least one personal record, newest first. */
export type RecordSession = { exercise: string; date: string; records: PersonalRecord[] }

export type HistoryOverview = {
  /** Days with at least one set done, oldest first. */
  days: WorkoutDay[]
  /** Most recently trained first. */
  exercises: ExerciseSummary[]
  recentRecords: RecordSession[]
}

const RECENT_RECORDS = 5

const isLoaded = (set: HistorySet): set is { reps: number; weight: number } => set.weight !== null && set.weight > 0

/**
 * Epley's estimate of the weight that could be lifted once. It's an estimate, and loses accuracy
 * past ~10 reps, but it puts 100×5 and 90×8 on one scale, which is what a progress line needs.
 */
export const estimateOneRepMax = (weight: number, reps: number) => (reps === 1 ? weight : weight * (1 + reps / 30))

const setE1rm = (set: HistorySet) => (isLoaded(set) ? estimateOneRepMax(set.weight, set.reps) : 0)

/** The first item with the highest score. */
function maxBy<T>(items: T[], score: (item: T) => number) {
  return items.reduce((best, item) => (score(item) > score(best) ? item : best))
}

const heavierSet = (set: HistorySet) => (set.weight ?? 0) * 10_000 + set.reps

// Scores compare floats; a hair over isn't a record.
const beats = (value: number, best: number) => value > best + 1e-9

/** Groups entries by exercise, matching names case-insensitively, keyed by the lowercased name. */
function groupByExercise(entries: ExerciseHistoryEntry[]) {
  const groups = new Map<string, ExerciseHistoryEntry[]>()
  for (const entry of entries) {
    const key = entry.name.toLowerCase()
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  return groups
}

/**
 * Builds one exercise's history from its entries (oldest first). An exercise that a plan lists
 * twice shows up twice on a day; its sets count as one session.
 */
export function buildExerciseHistory(entries: ExerciseHistoryEntry[]): ExerciseHistory {
  const byDate = new Map<string, ExerciseHistoryEntry>()
  for (const entry of entries) {
    const same = byDate.get(entry.date)
    byDate.set(
      entry.date,
      same
        ? { ...same, note: [same.note, entry.note].filter(Boolean).join(' · '), sets: [...same.sets, ...entry.sets] }
        : entry,
    )
  }
  const days = [...byDate.values()]
  const kind: ExerciseKind = days.some((day) => day.sets.some(isLoaded)) ? 'weighted' : 'bodyweight'

  // Bests so far, updated after each session.
  let heaviest = 0
  let bestE1rm = 0
  let mostReps = 0
  const earlierLoaded: { reps: number; weight: number }[] = []

  const sessions = days.map((day, index): ExerciseSession => {
    const loaded = day.sets.filter(isLoaded)
    const topSet = loaded.length ? maxBy(loaded, heavierSet) : maxBy(day.sets, (set) => set.reps)
    const bestSet = loaded.length ? maxBy(loaded, setE1rm) : null
    const repsSet = maxBy(day.sets, (set) => set.reps)
    const records: PersonalRecord[] = []

    if (index > 0 && kind === 'weighted' && bestSet) {
      if (beats(topSet.weight ?? 0, heaviest)) records.push({ kind: 'weight', set: topSet })
      if (beats(setE1rm(bestSet), bestE1rm)) records.push({ kind: 'e1rm', set: bestSet })

      // A new heaviest weight has nothing at or above it to beat, so it's never a rep record too.
      const repRecords = loaded.filter((set) => {
        const atOrAbove = earlierLoaded.filter((earlier) => earlier.weight >= set.weight)
        return atOrAbove.length > 0 && set.reps > Math.max(...atOrAbove.map((earlier) => earlier.reps))
      })
      if (repRecords.length) records.push({ kind: 'repsAtWeight', set: maxBy(repRecords, heavierSet) })
    }
    if (index > 0 && kind === 'bodyweight' && beats(repsSet.reps, mostReps)) {
      records.push({ kind: 'reps', set: repsSet })
    }

    heaviest = Math.max(heaviest, topSet.weight ?? 0)
    bestE1rm = Math.max(bestE1rm, bestSet ? setE1rm(bestSet) : 0)
    mostReps = Math.max(mostReps, repsSet.reps)
    earlierLoaded.push(...loaded)

    return {
      date: day.date,
      planName: day.planName,
      note: day.note,
      sets: day.sets,
      topSet,
      e1rm: bestSet ? setE1rm(bestSet) : null,
      records,
    }
  })

  const allSets = days.flatMap((day) => day.sets.map((set) => ({ set, date: day.date })))
  const allLoaded = allSets.filter(({ set }) => isLoaded(set))

  const heaviestSet = allLoaded.length ? maxBy(allLoaded, ({ set }) => heavierSet(set)) : null
  const e1rmSet = allLoaded.length ? maxBy(allLoaded, ({ set }) => setE1rm(set)) : null

  return {
    name: days.at(-1)!.name,
    kind,
    sessions,
    bests: {
      heaviest: heaviestSet,
      e1rm: e1rmSet && { ...e1rmSet, value: setE1rm(e1rmSet.set) },
      mostReps: maxBy(allSets, ({ set }) => set.reps),
    },
    repMaxes: repMaxes(allLoaded),
  }
}

function repMaxes(sets: { set: HistorySet; date: string }[]) {
  // The heaviest weight per rep count; on a tie, the earliest day it was done.
  const byReps = new Map<number, { reps: number; weight: number; date: string }>()
  for (const { set, date } of sets) {
    const best = byReps.get(set.reps)
    if (!best || beats(set.weight ?? 0, best.weight)) byReps.set(set.reps, { reps: set.reps, weight: set.weight ?? 0, date })
  }

  // Walking from most reps to fewest, a rep count only stays if it went heavier than every
  // rep count above it.
  const rows = [...byReps.values()].sort((a, b) => b.reps - a.reps)
  let heaviestAbove = 0
  return rows
    .filter((row) => {
      const keep = beats(row.weight, heaviestAbove)
      heaviestAbove = Math.max(heaviestAbove, row.weight)
      return keep
    })
    .reverse()
}

/** The measure a summary's `best` and `trend` use. */
const progressMeasure = (history: ExerciseHistory, session: ExerciseSession) =>
  history.kind === 'weighted' ? session.e1rm : Math.max(...session.sets.map((set) => set.reps))

function summarize(history: ExerciseHistory): ExerciseSummary {
  const measured = history.sessions.filter((session) => progressMeasure(history, session) !== null)
  const [previous, last] = measured.slice(-2).map((session) => progressMeasure(history, session)!)
  const lastSession = history.sessions.at(-1)!

  return {
    name: history.name,
    kind: history.kind,
    sessionCount: history.sessions.length,
    lastDate: lastSession.date,
    lastTopSet: lastSession.topSet,
    best: history.kind === 'weighted' ? history.bests.e1rm!.value : history.bests.mostReps.set.reps,
    trend: last === undefined ? null : beats(last, previous) ? 'up' : beats(previous, last) ? 'down' : 'flat',
  }
}

/** Everything the History tab's overview shows, from every exercise's entries (oldest first). */
export function buildOverview(entries: ExerciseHistoryEntry[]): HistoryOverview {
  const days = new Map<string, string>()
  for (const entry of entries) days.set(entry.date, entry.planName)

  const histories = [...groupByExercise(entries).values()].map(buildExerciseHistory)

  return {
    days: [...days].map(([date, planName]) => ({ date, planName })),
    exercises: histories
      .map(summarize)
      .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name)),
    recentRecords: histories
      .flatMap((history) =>
        history.sessions
          .filter((session) => session.records.length > 0)
          .map((session) => ({ exercise: history.name, date: session.date, records: session.records })),
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, RECENT_RECORDS),
  }
}

/**
 * Consecutive weeks (Monday to Sunday) with at least one workout, up to this week. A week that
 * hasn't had a workout yet doesn't break the streak until it's over.
 */
export function weekStreak(days: WorkoutDay[], today: string) {
  const weeks = new Set(days.map((day) => startOfWeek(day.date)))
  let week = startOfWeek(today)
  if (!weeks.has(week)) week = addDays(week, -7)

  let streak = 0
  while (weeks.has(week)) {
    streak += 1
    week = addDays(week, -7)
  }
  return streak
}

/** e.g. 102.5 → "102.5", 116.666 → "116.7", 100 → "100". */
export const formatKg = (value: number) => String(Math.round(value * 10) / 10)

/** e.g. "100×5", or "12" for a bodyweight set. */
export const formatSet = ({ reps, weight }: HistorySet) => (weight === null || weight === 0 ? `${reps}` : `${weight}×${reps}`)

export function describeRecord({ kind, set }: PersonalRecord) {
  switch (kind) {
    case 'weight':
      return `Heaviest · ${formatSet(set)}`
    case 'e1rm':
      return `Est. 1RM ${formatKg(setE1rm(set))} kg`
    case 'repsAtWeight':
      return `Rep record · ${formatSet(set)}`
    case 'reps':
      return `Most reps · ${set.reps}`
  }
}
