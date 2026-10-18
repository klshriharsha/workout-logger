'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Toast } from '@/components/Toast'
import { useToast } from '@/hooks/useToast'
import { createPlanSchema, MAX_EXERCISES, MAX_REPS, MAX_SETS, type CreatePlanInput } from '@/lib/plan-schema'

// Inputs hold raw strings so a half-typed value ("") isn't coerced while editing; they're
// converted to numbers once, on submit.
type ExerciseDraft = { key: string; name: string; sets: string; reps: string }

/** Field errors keyed by their path in the payload, e.g. "exercises.0.reps". */
type FieldErrors = Record<string, string>

// React list keys for rows added in event handlers; the initial row below uses a fixed key so
// the prerendered page doesn't depend on module state. (Not crypto.randomUUID: that is
// missing on plain-http LAN origins, e.g. a phone hitting the dev server.)
let keySequence = 0
const newKey = () => `draft-${++keySequence}`

const newExercise = (): ExerciseDraft => ({ key: newKey(), name: '', sets: '', reps: '' })

const initialExercises: ExerciseDraft[] = [{ key: 'initial-exercise', name: '', sets: '', reps: '' }]

const toNumber = (value: string) => (value.trim() === '' ? undefined : Number(value))

function toPayload(name: string, exercises: ExerciseDraft[]): CreatePlanInput {
  return {
    name,
    exercises: exercises.map((exercise) => ({
      name: exercise.name,
      sets: toNumber(exercise.sets) as number,
      reps: toNumber(exercise.reps) as number,
    })),
  }
}

const inputClass =
  'w-full rounded-lg border border-sand-880 bg-sand-1000 px-3 py-2.5 text-[15px] text-ink-240 outline-none transition-colors placeholder:text-sand-680 focus:border-teal-accent aria-invalid:border-red-accent'

const iconButtonClass =
  'grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-transparent text-sand-600 transition-colors hover:border-red-hover-border hover:bg-red-hover-bg hover:text-red-hover-text disabled:pointer-events-none disabled:opacity-30'

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-[13px] text-red-accent">{message}</p>
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
    </svg>
  )
}

export function PlanForm() {
  const router = useRouter()
  const { toast, flash } = useToast()
  const [name, setName] = useState('')
  const [exercises, setExercises] = useState(initialExercises)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const shouldReset = useRef(false)

  // With Cache Components, navigating away hides this page (React Activity) instead of
  // unmounting it, so a saved plan's fields and "Saving…" state would greet the next visit.
  // Reset once the page is hidden after a successful save; unsaved drafts are kept.
  useLayoutEffect(() => {
    return () => {
      if (!shouldReset.current) return
      shouldReset.current = false
      setName('')
      setExercises(initialExercises)
      setErrors({})
      setSubmitting(false)
    }
  }, [])

  const updateExercise = (exerciseKey: string, update: (exercise: ExerciseDraft) => ExerciseDraft) =>
    setExercises((current) => current.map((exercise) => (exercise.key === exerciseKey ? update(exercise) : exercise)))

  // Errors are keyed by index, so any structural change would point them at the wrong row.
  const clearErrors = () => setErrors({})

  const addExercise = () => {
    clearErrors()
    setExercises((current) => [...current, newExercise()])
  }

  const removeExercise = (exerciseKey: string) => {
    clearErrors()
    setExercises((current) => current.filter((exercise) => exercise.key !== exerciseKey))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    const parsed = createPlanSchema.safeParse(toPayload(name, exercises))

    if (!parsed.success) {
      const fieldErrors: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.join('.')] ??= issue.message
      }
      setErrors(fieldErrors)
      flash('Fix the highlighted fields')
      return
    }

    setErrors({})
    setSubmitting(true)

    try {
      const response = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })

      if (!response.ok) throw new Error(`Request failed with ${response.status}`)

      shouldReset.current = true
      router.push('/plans')
    } catch {
      flash('Could not save the plan. Try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <section className="rounded-2xl border border-sand-900 bg-sand-1000 px-4.5 py-4 shadow-card">
        <label htmlFor="plan-name" className="mb-1.5 block text-sm font-semibold">
          Plan name
        </label>
        <input
          id="plan-name"
          className={inputClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Upper, Push, Legs"
          maxLength={100}
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
        />
        <FieldError message={errors.name} />
      </section>

      {exercises.map((exercise, exerciseIndex) => {
        const path = `exercises.${exerciseIndex}`

        return (
          <section
            key={exercise.key}
            aria-label={`Exercise ${exerciseIndex + 1}`}
            className="animate-in-200 rounded-2xl border border-sand-900 bg-sand-1000 px-4.5 py-4 shadow-card"
          >
            <div className="flex items-start gap-2">
              <span className="mt-2.5 font-mono text-[11px] tracking-[0.1em] text-sand-600 uppercase">
                {String(exerciseIndex + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0 flex-1">
                <input
                  className={`${inputClass} font-semibold`}
                  value={exercise.name}
                  onChange={(event) => updateExercise(exercise.key, (current) => ({ ...current, name: event.target.value }))}
                  placeholder="Exercise, e.g. Bench press"
                  aria-label={`Exercise ${exerciseIndex + 1} name`}
                  maxLength={100}
                  autoComplete="off"
                  aria-invalid={Boolean(errors[`${path}.name`])}
                />
                <FieldError message={errors[`${path}.name`]} />
              </div>
              <button
                type="button"
                className={`${iconButtonClass} mt-0.5`}
                onClick={() => removeExercise(exercise.key)}
                disabled={exercises.length === 1}
                aria-label={`Remove exercise ${exerciseIndex + 1}`}
              >
                <RemoveIcon />
              </button>
            </div>

            <div className="mt-3 flex items-start gap-2 pl-7">
              <div className="w-24">
                <label htmlFor={`${exercise.key}-sets`} className="mb-1 block font-mono text-[11px] tracking-[0.1em] text-sand-600 uppercase">
                  Sets
                </label>
                <input
                  id={`${exercise.key}-sets`}
                  className={`${inputClass} font-mono`}
                  value={exercise.sets}
                  onChange={(event) => updateExercise(exercise.key, (current) => ({ ...current, sets: event.target.value }))}
                  inputMode="numeric"
                  placeholder="3"
                  maxLength={String(MAX_SETS).length}
                  autoComplete="off"
                  aria-invalid={Boolean(errors[`${path}.sets`])}
                />
              </div>
              <span className="mt-8 text-sand-600" aria-hidden>
                ×
              </span>
              <div className="w-24">
                <label htmlFor={`${exercise.key}-reps`} className="mb-1 block font-mono text-[11px] tracking-[0.1em] text-sand-600 uppercase">
                  Reps
                </label>
                <input
                  id={`${exercise.key}-reps`}
                  className={`${inputClass} font-mono`}
                  value={exercise.reps}
                  onChange={(event) => updateExercise(exercise.key, (current) => ({ ...current, reps: event.target.value }))}
                  inputMode="numeric"
                  placeholder="10"
                  maxLength={String(MAX_REPS).length}
                  autoComplete="off"
                  aria-invalid={Boolean(errors[`${path}.reps`])}
                />
              </div>
            </div>
            {(errors[`${path}.sets`] || errors[`${path}.reps`]) && (
              <div className="pl-7">
                <FieldError message={[errors[`${path}.sets`], errors[`${path}.reps`]].filter(Boolean).join(' · ')} />
              </div>
            )}
          </section>
        )
      })}
      <FieldError message={errors.exercises} />

      <button
        type="button"
        className="rounded-2xl border border-dashed border-sand-820 px-4 py-3.5 text-sm font-semibold text-teal-deep transition-colors hover:border-teal-tint-border hover:bg-teal-hover-bg disabled:pointer-events-none disabled:opacity-40"
        onClick={addExercise}
        disabled={exercises.length >= MAX_EXERCISES}
      >
        + Add exercise
      </button>

      <div className="mt-2 flex items-center justify-end gap-3">
        <Link href="/plans" className="rounded-lg px-4 py-2.5 text-sm font-semibold text-ink-450 hover:bg-sand-940 hover:text-ink-240 hover:no-underline">
          Cancel
        </Link>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-teal-deep px-5 py-2.5 text-sm font-semibold text-teal-on-accent shadow-cta transition-colors hover:bg-teal-deep-hover disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Save plan'}
        </button>
      </div>

      <Toast message={toast} />
    </form>
  )
}
