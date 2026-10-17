'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { HistoryCalendar } from '@/components/HistoryCalendar'
import { RecordBadges } from '@/components/RecordBadges'
import { addDays, shortDate, startOfWeek, todayKey } from '@/lib/dates'
import { plural } from '@/lib/format'
import { formatKg, formatSet, weekStreak, type ExerciseSummary, type HistoryOverview as Overview } from '@/lib/progress'

// `today` is read when the data arrives, in the browser, so it's the user's local day.
type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; overview: Overview; today: string }

export const exerciseHref = (name: string) => `/history/exercise?name=${encodeURIComponent(name)}`

/** The History tab: training frequency, recent personal records and every exercise's progress. */
export function HistoryOverview() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/history', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed with ${response.status}`)
        return response.json() as Promise<Overview>
      })
      .then((overview) => setState({ status: 'ready', overview, today: todayKey() }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' })
      })

    return () => controller.abort()
  }, [])

  if (state.status === 'loading') {
    return <p className="animate-pulse-soft px-1 text-sm text-sand-600">Loading your history…</p>
  }

  if (state.status === 'error') {
    return <p className="px-1 text-sm text-red-accent">Could not load your history. Refresh to try again.</p>
  }

  const { overview, today } = state

  if (overview.days.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-sand-820 px-4.5 py-8 text-center text-sm text-ink-480">
        Nothing here yet. Tick off sets in the <Link href="/">Log</Link> and your progress will show up here.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <SummaryStrip overview={overview} today={today} />
      <HistoryCalendar days={overview.days} today={today} />
      {overview.recentRecords.length > 0 && <RecentRecords overview={overview} today={today} />}
      <ExerciseList exercises={overview.exercises} today={today} />
    </div>
  )
}

function SummaryStrip({ overview, today }: { overview: Overview; today: string }) {
  const weekStart = startOfWeek(today)
  const weekEnd = addDays(weekStart, 6)
  // Date keys are YYYY-MM-DD, so they compare chronologically as strings.
  const thisWeek = overview.days.filter((day) => day.date >= weekStart && day.date <= weekEnd).length
  const thisMonth = overview.days.filter((day) => day.date.slice(0, 7) === today.slice(0, 7)).length
  const streak = weekStreak(overview.days, today)

  return (
    <dl className="grid grid-cols-3 gap-2.5">
      <Stat label="This week" value={thisWeek} detail={thisWeek === 1 ? 'workout' : 'workouts'} />
      <Stat label="This month" value={thisMonth} detail={thisMonth === 1 ? 'workout' : 'workouts'} />
      <Stat label="Streak" value={streak} detail={streak === 1 ? 'week' : 'weeks in a row'} />
    </dl>
  )
}

function Stat({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-sand-900 bg-sand-1000 px-3.5 py-3 shadow-card">
      <dt className="font-mono text-[10px] tracking-[0.1em] text-sand-600 uppercase">{label}</dt>
      <dd className="mt-1">
        <span className="text-[26px] leading-none font-bold tracking-[-0.02em]">{value}</span>
        <span className="mt-1 block truncate text-xs text-ink-480">{detail}</span>
      </dd>
    </div>
  )
}

function RecentRecords({ overview, today }: { overview: Overview; today: string }) {
  return (
    <section aria-labelledby="records-heading">
      <h2 id="records-heading" className="mb-2.5 px-1 text-[17px] font-bold tracking-[-0.01em]">
        Recent records
      </h2>
      <ul className="flex flex-col gap-2">
        {overview.recentRecords.map((session) => (
          <li key={`${session.exercise}-${session.date}`}>
            <Link
              href={exerciseHref(session.exercise)}
              className="flex items-start gap-3 rounded-2xl border border-sand-900 bg-sand-1000 px-4 py-3 text-ink-240 shadow-card transition-colors hover:border-teal-tint-border hover:text-ink-240 hover:no-underline"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{session.exercise}</p>
                <RecordBadges records={session.records} className="mt-1.5" />
              </div>
              <span className="shrink-0 font-mono text-xs text-sand-600">{shortDate(session.date, today)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

const trendIcon = { up: '↑', down: '↓', flat: '→' } as const
const trendLabel = { up: 'Up on the session before', down: 'Down on the session before', flat: 'Same as the session before' } as const
const trendClass = { up: 'text-teal-deep', down: 'text-amber-text', flat: 'text-sand-600' } as const

function ExerciseList({ exercises, today }: { exercises: ExerciseSummary[]; today: string }) {
  return (
    <section aria-labelledby="exercises-heading">
      <h2 id="exercises-heading" className="px-1 text-[17px] font-bold tracking-[-0.01em]">
        Exercises
      </h2>
      <p className="mt-0.5 mb-2.5 px-1 text-sm text-ink-480">Tap one to see its progress and best lifts.</p>
      <ul className="flex flex-col gap-2">
        {exercises.map((exercise) => (
          <li key={exercise.name}>
            <Link
              href={exerciseHref(exercise.name)}
              className="flex items-center gap-3 rounded-2xl border border-sand-900 bg-sand-1000 px-4 py-3 text-ink-240 shadow-card transition-colors hover:border-teal-tint-border hover:text-ink-240 hover:no-underline"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{exercise.name}</p>
                <p className="mt-0.5 truncate font-mono text-xs text-sand-600">
                  Last {shortDate(exercise.lastDate, today)}: {formatSet(exercise.lastTopSet)} · {plural(exercise.sessionCount, 'session')}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-[10px] tracking-[0.1em] text-sand-600 uppercase">
                  {exercise.kind === 'weighted' ? 'Est. 1RM' : 'Best reps'}
                </p>
                <p className="font-mono text-[15px] font-semibold">
                  {exercise.kind === 'weighted' ? `${formatKg(exercise.best)} kg` : exercise.best}
                  {exercise.trend && (
                    <span className={`ml-1 ${trendClass[exercise.trend]}`} title={trendLabel[exercise.trend]}>
                      <span aria-hidden>{trendIcon[exercise.trend]}</span>
                      <span className="sr-only">{trendLabel[exercise.trend]}</span>
                    </span>
                  )}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
