'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ProgressChart, type ChartPoint } from '@/components/ProgressChart'
import { RecordBadges } from '@/components/RecordBadges'
import { fullDate, shortDate, todayKey } from '@/lib/dates'
import { plural } from '@/lib/format'
import { formatKg, formatSet, type ExerciseHistory, type RecordKind } from '@/lib/progress'

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; exercise: ExerciseHistory | null; today: string }

/** One exercise's progress: best lifts, a progress line and every session. Reads ?name=. */
export function ExerciseProgress() {
  const name = useSearchParams().get('name')?.trim()

  if (!name) return <p className="mt-3 px-1 text-sm text-ink-480">Pick an exercise from the History tab.</p>

  return <ExerciseContent key={name} name={name} />
}

function ExerciseContent({ name }: { name: string }) {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    fetch(`/api/history/exercise?name=${encodeURIComponent(name)}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed with ${response.status}`)
        return response.json() as Promise<{ exercise: ExerciseHistory | null }>
      })
      .then(({ exercise }) => setState({ status: 'ready', exercise, today: todayKey() }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' })
      })

    return () => controller.abort()
  }, [name])

  if (state.status === 'loading') return <p className="animate-pulse-soft mt-3 px-1 text-sm text-sand-600">Loading…</p>
  if (state.status === 'error') {
    return <p className="mt-3 px-1 text-sm text-red-accent">Could not load this exercise. Refresh to try again.</p>
  }

  const { exercise, today } = state

  if (!exercise) {
    return (
      <>
        <h1 className="mt-2 text-[22px] font-bold tracking-[-0.02em]">{name}</h1>
        <p className="mt-1 text-sm text-ink-480">No sets of this exercise have been ticked off yet.</p>
      </>
    )
  }

  const first = exercise.sessions[0]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="mt-2 text-[22px] font-bold tracking-[-0.02em]">{exercise.name}</h1>
        <p className="mt-1 text-sm text-ink-480">
          {plural(exercise.sessions.length, 'session')} since {shortDate(first.date, today)}
        </p>
      </div>

      <Bests exercise={exercise} today={today} />
      <ProgressCard exercise={exercise} today={today} />
      {exercise.kind === 'weighted' && exercise.repMaxes.length > 1 && <RepMaxes exercise={exercise} today={today} />}
      <Sessions exercise={exercise} today={today} />
    </div>
  )
}

function Bests({ exercise, today }: { exercise: ExerciseHistory; today: string }) {
  const { heaviest, e1rm, mostReps } = exercise.bests

  return (
    <dl className="grid grid-cols-2 gap-2.5">
      {exercise.kind === 'weighted' && heaviest && e1rm ? (
        <>
          <Best label="Heaviest" value={`${heaviest.set.weight} kg`} detail={`× ${plural(heaviest.set.reps, 'rep')} · ${shortDate(heaviest.date, today)}`} />
          <Best label="Best est. 1RM" value={`${formatKg(e1rm.value)} kg`} detail={`${formatSet(e1rm.set)} · ${shortDate(e1rm.date, today)}`} />
        </>
      ) : (
        <>
          <Best label="Most reps" value={String(mostReps.set.reps)} detail={`in one set · ${shortDate(mostReps.date, today)}`} />
          <Best
            label="Last session"
            value={String(exercise.sessions.at(-1)!.sets.reduce((total, set) => total + set.reps, 0))}
            detail={`total reps · ${shortDate(exercise.sessions.at(-1)!.date, today)}`}
          />
        </>
      )}
    </dl>
  )
}

function Best({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-sand-900 bg-sand-1000 px-3.5 py-3 shadow-card">
      <dt className="font-mono text-[10px] tracking-[0.1em] text-sand-600 uppercase">{label}</dt>
      <dd className="mt-1">
        <span className="text-[24px] leading-none font-bold tracking-[-0.02em]">{value}</span>
        <span className="mt-1 block truncate font-mono text-xs text-ink-480">{detail}</span>
      </dd>
    </div>
  )
}

type Measure = 'e1rm' | 'top'

const measures: { id: Measure; label: string; description: string }[] = [
  { id: 'e1rm', label: 'Est. 1RM', description: 'Best estimated one-rep max each session, in kg' },
  { id: 'top', label: 'Top set', description: 'Heaviest set each session, in kg' },
]

function ProgressCard({ exercise, today }: { exercise: ExerciseHistory; today: string }) {
  const [measure, setMeasure] = useState<Measure>('e1rm')

  // A dot is amber when the session set a record on what's plotted, so it marks a new high on the line.
  const plotted: RecordKind = exercise.kind === 'bodyweight' ? 'reps' : measure === 'e1rm' ? 'e1rm' : 'weight'
  const records = (session: ExerciseHistory['sessions'][number]) => session.records.some((record) => record.kind === plotted)

  const points: ChartPoint[] =
    exercise.kind === 'bodyweight'
      ? exercise.sessions.map((session) => ({
          date: session.date,
          value: session.topSet.reps,
          detail: session.sets.map(formatSet).join(', '),
          record: records(session),
        }))
      : exercise.sessions.flatMap((session) => {
          // A session done without weight has nothing to plot on a kg scale.
          if (session.e1rm === null) return []
          return {
            date: session.date,
            value: measure === 'e1rm' ? session.e1rm : session.topSet.weight!,
            detail: formatSet(session.topSet),
            record: records(session),
          }
        })

  const description =
    exercise.kind === 'bodyweight' ? 'Most reps in a set, each session' : measures.find((option) => option.id === measure)!.description

  return (
    <section aria-labelledby="progress-heading" className="rounded-2xl border border-sand-900 bg-sand-1000 px-3.5 pt-3.5 pb-2 shadow-card">
      <div className="mb-2 flex items-start justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <h2 id="progress-heading" className="text-[15px] font-bold">
            Progress
          </h2>
          <p className="text-xs text-ink-480">{description}</p>
        </div>
        {exercise.kind === 'weighted' && (
          <div role="radiogroup" aria-label="Measure" className="flex shrink-0 gap-0.5 rounded-lg bg-sand-950 p-0.5">
            {measures.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={measure === option.id}
                onClick={() => setMeasure(option.id)}
                className="rounded-md px-2.5 py-1 text-xs font-semibold text-ink-450 transition-colors hover:text-ink-240 aria-checked:bg-sand-1000 aria-checked:text-teal-deep aria-checked:shadow-card"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {points.length < 2 ? (
        <p className="px-0.5 pt-4 pb-6 text-sm text-ink-480">Log this exercise once more to see a progress line.</p>
      ) : (
        <>
          <ProgressChart
            points={points}
            formatValue={exercise.kind === 'weighted' ? formatKg : String}
            label={description}
            today={today}
          />
          {points.some((point) => point.record) && (
            <p className="flex items-center gap-1.5 px-0.5 pb-1 text-[11px] text-ink-480">
              <span aria-hidden className="h-2 w-2 rounded-full bg-amber-accent" />
              New best
            </p>
          )}
        </>
      )}
    </section>
  )
}

function RepMaxes({ exercise, today }: { exercise: ExerciseHistory; today: string }) {
  return (
    <section aria-labelledby="rep-maxes-heading">
      <h2 id="rep-maxes-heading" className="px-1 text-[17px] font-bold tracking-[-0.01em]">
        Best by reps
      </h2>
      <p className="mt-0.5 mb-2.5 px-1 text-sm text-ink-480">The heaviest weight you&apos;ve done for each number of reps.</p>
      <table className="w-full overflow-hidden rounded-2xl border border-sand-900 bg-sand-1000 text-left shadow-card">
        <thead>
          <tr className="border-b border-sand-930 font-mono text-[10px] tracking-[0.1em] text-sand-600 uppercase">
            <th scope="col" className="px-4 py-2 font-normal">Reps</th>
            <th scope="col" className="px-4 py-2 font-normal">Weight</th>
            <th scope="col" className="px-4 py-2 text-right font-normal">When</th>
          </tr>
        </thead>
        <tbody className="font-mono text-sm tabular-nums">
          {exercise.repMaxes.map((row) => (
            <tr key={row.reps} className="border-b border-sand-940 last:border-0">
              <td className="px-4 py-2 text-ink-420">{row.reps}</td>
              <td className="px-4 py-2 font-semibold">{row.weight} kg</td>
              <td className="px-4 py-2 text-right text-xs text-sand-600">{shortDate(row.date, today)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function Sessions({ exercise, today }: { exercise: ExerciseHistory; today: string }) {
  return (
    <section aria-labelledby="sessions-heading">
      <h2 id="sessions-heading" className="mb-2.5 px-1 text-[17px] font-bold tracking-[-0.01em]">
        Sessions
      </h2>
      <ol className="flex flex-col gap-2">
        {exercise.sessions.toReversed().map((session) => (
          <li key={session.date} className="rounded-2xl border border-sand-900 bg-sand-1000 px-4 py-3 shadow-card">
            <div className="flex items-baseline justify-between gap-3">
              <time dateTime={session.date} title={fullDate(session.date)} className="text-[15px] font-semibold">
                {shortDate(session.date, today)}
              </time>
              <span className="truncate font-mono text-xs text-sand-600">{session.planName}</span>
            </div>
            <p className="mt-1 font-mono text-sm text-ink-420">
              {session.sets.map(formatSet).join(', ')}
              {exercise.kind === 'weighted' && session.e1rm !== null && (
                <span className="text-sand-600"> · est. 1RM {formatKg(session.e1rm)}</span>
              )}
            </p>
            {session.note && <p className="mt-1.5 text-sm text-ink-480">{session.note}</p>}
            {session.records.length > 0 && <RecordBadges records={session.records} className="mt-2" />}
          </li>
        ))}
      </ol>
    </section>
  )
}
