'use client'

import { useState } from 'react'
import { useAutosave, type SaveStatus } from '@/hooks/useAutosave'
import { shortDate } from '@/lib/dates'
import { plural } from '@/lib/format'
import {
  MAX_LOGGED_SETS,
  MAX_NOTE_LENGTH,
  type PreviousSession,
  type SaveLog,
  type WorkoutLog,
} from '@/lib/log-schema'
import { MAX_REPS } from '@/lib/plan-schema'

// Inputs hold raw strings so a half-typed weight ("62.") isn't coerced while editing; they're
// converted to numbers when the log is saved.
type SetDraft = { key: string; reps: string; weight: string; done: boolean }

type ExerciseDraft = {
  key: string
  name: string
  targetSets: number
  targetReps: number
  note: string
  previous: PreviousSession | null
  sets: SetDraft[]
}

// React list keys (see PlanForm for why this isn't crypto.randomUUID).
let keySequence = 0
const newKey = () => `log-${++keySequence}`

const toDrafts = (log: WorkoutLog): ExerciseDraft[] =>
  log.exercises.map((exercise) => ({
    ...exercise,
    key: newKey(),
    sets: exercise.sets.map((set) => ({
      key: newKey(),
      reps: String(set.reps),
      weight: set.weight === null ? '' : String(set.weight),
      done: set.done,
    })),
  }))

const toPayload = (exercises: ExerciseDraft[]): SaveLog => ({
  exercises: exercises.map((exercise) => ({
    name: exercise.name,
    targetSets: exercise.targetSets,
    targetReps: exercise.targetReps,
    note: exercise.note,
    sets: exercise.sets.map((set) => {
      const weight = Number(set.weight)
      return {
        reps: set.reps === '' ? 0 : Number(set.reps),
        weight: set.weight === '' || Number.isNaN(weight) ? null : weight,
        done: set.done,
      }
    }),
  })),
})

/** Digits only, capped at MAX_REPS. */
const cleanReps = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  return digits === '' ? '' : String(Math.min(Number(digits), MAX_REPS))
}

/** Up to 4 digits, then up to 2 decimals. Accepts a comma as the decimal separator. */
const cleanWeight = (value: string) => {
  const [whole = '', ...rest] = value.replace(',', '.').replace(/[^\d.]/g, '').split('.')
  const intPart = whole.slice(0, 4)
  return rest.length ? `${intPart}.${rest.join('').slice(0, 2)}` : intPart
}

const formatSet = ({ reps, weight }: { reps: number; weight: number | null }) =>
  weight === null ? `${reps}` : `${weight}×${reps}`

type LogEditorProps = {
  log: WorkoutLog
  today: string
  /** Deletes the day's log so a different plan can be picked. */
  onClear: () => Promise<void>
}

export function LogEditor({ log, today, onClear }: LogEditorProps) {
  const [exercises, setExercises] = useState(() => toDrafts(log))
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  const { status, schedule, retry } = useAutosave<SaveLog>(async (payload, { keepalive }) => {
    const response = await fetch(`/api/logs/${log.date}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive,
    })
    if (!response.ok) throw new Error(`Request failed with ${response.status}`)
  })

  const change = (next: ExerciseDraft[]) => {
    setExercises(next)
    schedule(toPayload(next))
  }

  const updateExercise = (exerciseKey: string, update: (exercise: ExerciseDraft) => ExerciseDraft) =>
    change(exercises.map((exercise) => (exercise.key === exerciseKey ? update(exercise) : exercise)))

  const setCount = exercises.reduce((total, exercise) => total + exercise.sets.length, 0)
  const doneCount = exercises.reduce((total, exercise) => total + exercise.sets.filter((set) => set.done).length, 0)
  const hasProgress = doneCount > 0 || exercises.some((exercise) => exercise.note.trim() !== '')

  const clear = async () => {
    setClearing(true)
    await onClear()
    setClearing(false)
    setConfirmingClear(false)
  }

  return (
    <section aria-labelledby="log-heading" className="flex flex-col gap-3.5">
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 id="log-heading" className="truncate text-[17px] font-bold tracking-[-0.01em]">
            {log.planName}
          </h2>
          <p className="mt-0.5 font-mono text-xs text-sand-600">
            {doneCount} / {plural(setCount, 'set')} done
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SaveIndicator status={status} onRetry={retry} />
          <button
            type="button"
            onClick={() => (hasProgress ? setConfirmingClear(true) : clear())}
            disabled={clearing}
            className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-ink-450 transition-colors hover:bg-sand-940 hover:text-ink-240 disabled:opacity-60"
          >
            Change plan
          </button>
        </div>
      </div>

      {confirmingClear && (
        <div role="alert" className="animate-in-140 rounded-2xl border border-red-hover-border bg-red-hover-bg px-4.5 py-3.5">
          <p className="text-sm text-ink-260">
            Changing the plan clears everything you&apos;ve logged on this day. Your plans aren&apos;t affected.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmingClear(false)}
              className="rounded-lg px-3.5 py-2 text-sm font-semibold text-ink-450 hover:bg-sand-1000 hover:text-ink-240"
            >
              Keep logging
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={clearing}
              className="rounded-lg bg-red-accent px-3.5 py-2 text-sm font-semibold text-red-on-accent disabled:opacity-60"
            >
              {clearing ? 'Clearing…' : 'Clear day'}
            </button>
          </div>
        </div>
      )}

      {exercises.map((exercise, index) => (
        <ExerciseCard
          key={exercise.key}
          exercise={exercise}
          index={index}
          today={today}
          onChange={(update) => updateExercise(exercise.key, update)}
        />
      ))}
    </section>
  )
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === 'error') {
    return (
      <button type="button" onClick={onRetry} className="font-mono text-[11px] tracking-[0.06em] text-red-accent uppercase">
        Not saved · Retry
      </button>
    )
  }

  return (
    <span aria-live="polite" className="font-mono text-[11px] tracking-[0.06em] text-sand-600 uppercase">
      {status === 'saved' ? 'Saved' : 'Saving…'}
    </span>
  )
}

const numberInputClass =
  'h-11 w-full min-w-0 rounded-lg border border-sand-880 bg-sand-1000 px-2 text-center font-mono text-[15px] text-ink-240 outline-none transition-colors placeholder:text-sand-780 focus:border-teal-accent'

type ExerciseCardProps = {
  exercise: ExerciseDraft
  index: number
  today: string
  onChange: (update: (exercise: ExerciseDraft) => ExerciseDraft) => void
}

function ExerciseCard({ exercise, index, today, onChange }: ExerciseCardProps) {
  // The note is edited as a local draft and only committed (and autosaved) on Save, so Cancel
  // can throw the edit away.
  const [noteDraft, setNoteDraft] = useState<string | null>(null)
  const editingNote = noteDraft !== null
  const doneCount = exercise.sets.filter((set) => set.done).length
  const allDone = doneCount > 0 && doneCount === exercise.sets.length

  const updateSet = (setKey: string, update: (set: SetDraft) => SetDraft) =>
    onChange((current) => ({ ...current, sets: current.sets.map((set) => (set.key === setKey ? update(set) : set)) }))

  // A set can only be ticked off once both fields are filled in (0 kg for bodyweight work).
  const isFilled = ({ reps, weight }: Pick<SetDraft, 'reps' | 'weight'>) =>
    Number(reps) > 0 && weight !== '' && !Number.isNaN(Number(weight))

  // Changing a set's weight carries it to the later sets that still had the old weight and
  // aren't done yet, so going up 2.5 kg is one edit, not one per set.
  const changeWeight = (setIndex: number, weight: string) =>
    onChange((current) => {
      const previousWeight = current.sets[setIndex].weight
      return {
        ...current,
        sets: current.sets.map((set, index) => {
          // Clearing a done set's field un-ticks it, so a done set is always filled in.
          if (index === setIndex) return { ...set, weight, done: set.done && isFilled({ ...set, weight }) }
          if (index > setIndex && !set.done && set.weight === previousWeight) return { ...set, weight }
          return set
        }),
      }
    })

  const toggleDone = (set: SetDraft) => {
    if (!set.done && !isFilled(set)) return
    updateSet(set.key, (current) => ({ ...current, done: !current.done }))
  }

  const addSet = () =>
    onChange((current) => {
      const last = current.sets.at(-1)
      return {
        ...current,
        sets: [
          ...current.sets,
          { key: newKey(), reps: last?.reps || String(current.targetReps), weight: last?.weight ?? '', done: false },
        ],
      }
    })

  const removeSet = () => onChange((current) => ({ ...current, sets: current.sets.slice(0, -1) }))

  const saveNote = () => {
    if (noteDraft === null) return
    const note = noteDraft.trim()
    if (note !== exercise.note) onChange((current) => ({ ...current, note }))
    setNoteDraft(null)
  }

  return (
    <article
      aria-labelledby={`${exercise.key}-name`}
      className={`animate-in-200 rounded-2xl border bg-sand-1000 px-4 py-3.5 shadow-card transition-colors ${
        allDone ? 'border-teal-tint-border' : 'border-sand-900'
      }`}
    >
      <header className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] tracking-[0.1em] text-sand-600">{String(index + 1).padStart(2, '0')}</span>
        <h3 id={`${exercise.key}-name`} className="min-w-0 flex-1 truncate text-[15px] font-semibold">
          {exercise.name}
        </h3>
        <span className={`shrink-0 font-mono text-xs ${allDone ? 'text-teal-deep' : 'text-sand-600'}`}>
          {doneCount}/{exercise.sets.length}
        </span>
      </header>
      <p className="mt-0.5 pl-6.5 font-mono text-xs text-sand-600">
        Target {exercise.targetSets} × {exercise.targetReps}
        {exercise.previous && (
          <>
            <span aria-hidden> · </span>
            <span className="text-ink-480">
              Last ({shortDate(exercise.previous.date, today)}): {exercise.previous.sets.map(formatSet).join(', ')}
            </span>
          </>
        )}
      </p>

      <div className="mt-3 grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_44px] items-center gap-x-2 gap-y-1.5">
        <span className="font-mono text-[10px] tracking-[0.1em] text-sand-600 uppercase">Set</span>
        <span className="text-center font-mono text-[10px] tracking-[0.1em] text-sand-600 uppercase">kg</span>
        <span className="text-center font-mono text-[10px] tracking-[0.1em] text-sand-600 uppercase">Reps</span>
        {/* sr-only is position: absolute, which would take it out of the grid; the wrapper holds the cell. */}
        <span>
          <span className="sr-only">Done</span>
        </span>

        {exercise.sets.map((set, setIndex) => {
          const label = `${exercise.name} set ${setIndex + 1}`
          const extra = setIndex >= exercise.targetSets

          return (
            <div key={set.key} className="contents">
              <span
                className={`font-mono text-sm font-semibold ${extra ? 'text-amber-text' : 'text-ink-420'}`}
                title={extra ? 'Extra set (beyond the plan)' : undefined}
              >
                {extra ? '+' : ''}
                {setIndex + 1}
              </span>
              <input
                className={`${numberInputClass} ${set.done ? 'border-teal-tint-border bg-teal-tint' : ''}`}
                value={set.weight}
                onChange={(event) => changeWeight(setIndex, cleanWeight(event.target.value))}
                onFocus={(event) => event.target.select()}
                inputMode="decimal"
                placeholder="—"
                aria-label={`${label} weight in kg`}
                autoComplete="off"
              />
              <input
                className={`${numberInputClass} ${set.done ? 'border-teal-tint-border bg-teal-tint' : ''}`}
                value={set.reps}
                onChange={(event) =>
                  updateSet(set.key, (current) => {
                    const reps = cleanReps(event.target.value)
                    return { ...current, reps, done: current.done && isFilled({ ...current, reps }) }
                  })
                }
                onFocus={(event) => event.target.select()}
                inputMode="numeric"
                placeholder={String(exercise.targetReps)}
                aria-label={`${label} reps`}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => toggleDone(set)}
                disabled={!set.done && !isFilled(set)}
                aria-pressed={set.done}
                aria-label={`${label} done`}
                title={!set.done && !isFilled(set) ? 'Enter kg and reps first (0 kg for bodyweight)' : undefined}
                className={`grid h-11 w-11 place-items-center rounded-lg border-2 transition-colors ${
                  set.done
                    ? 'border-teal-deep bg-teal-deep text-teal-on-accent hover:border-teal-deep-hover hover:bg-teal-deep-hover'
                    : 'border-teal-accent bg-sand-1000 text-teal-deep hover:bg-teal-hover-bg disabled:cursor-not-allowed disabled:border-dashed disabled:border-sand-860 disabled:bg-transparent disabled:text-sand-860'
                }`}
              >
                <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                  <path d="M4.5 10.5l3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={addSet}
          disabled={exercise.sets.length >= MAX_LOGGED_SETS}
          className="rounded-lg px-2.5 py-2 text-sm font-semibold text-teal-deep transition-colors hover:bg-teal-hover-bg disabled:opacity-40"
        >
          + Add set
        </button>
        <button
          type="button"
          onClick={removeSet}
          disabled={exercise.sets.length <= 1}
          className="rounded-lg px-2.5 py-2 text-sm font-semibold text-ink-450 transition-colors hover:bg-sand-940 hover:text-ink-240 disabled:opacity-40"
        >
          − Remove set
        </button>
        {!editingNote && exercise.note === '' && (
          <button
            type="button"
            onClick={() => setNoteDraft('')}
            className="ml-auto rounded-lg px-2.5 py-2 text-sm font-semibold text-ink-450 transition-colors hover:bg-sand-940 hover:text-ink-240"
          >
            Add note
          </button>
        )}
      </div>

      {!editingNote && exercise.note !== '' && (
        <button
          type="button"
          onClick={() => setNoteDraft(exercise.note)}
          aria-label={`Edit ${exercise.name} note`}
          className="mt-1.5 block w-full rounded-lg border border-transparent px-3 py-2.5 text-left text-sm whitespace-pre-wrap text-ink-480 transition-colors hover:border-sand-880 hover:bg-sand-940"
        >
          {exercise.note}
        </button>
      )}

      {editingNote && (
        <div className="mt-1.5">
          <textarea
            className="block w-full resize-y rounded-lg border border-sand-880 bg-sand-1000 px-3 py-2.5 text-sm text-ink-240 outline-none transition-colors placeholder:text-sand-680 focus:border-teal-accent"
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setNoteDraft(null)
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) saveNote()
            }}
            placeholder="How did it feel? Form cues, pain, machine settings…"
            aria-label={`${exercise.name} note`}
            maxLength={MAX_NOTE_LENGTH}
            rows={2}
            autoFocus
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setNoteDraft(null)}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-ink-450 transition-colors hover:bg-sand-940 hover:text-ink-240"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveNote}
              disabled={noteDraft.trim() === exercise.note}
              className="rounded-lg bg-teal-deep px-3 py-1.5 text-sm font-semibold text-teal-on-accent transition-colors hover:bg-teal-deep-hover disabled:opacity-40"
            >
              Save note
            </button>
          </div>
        </div>
      )}
    </article>
  )
}
