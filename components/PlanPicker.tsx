'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { plural } from '@/lib/format'
import type { PlanSummary } from '@/lib/plan-schema'

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; plans: PlanSummary[] }

type PlanPickerProps = {
  date: string
  today: string
  onPick: (planId: string) => Promise<void>
}

/** Shown on a day with nothing logged: choose which plan this day's workout follows. */
export function PlanPicker({ date, today, onPick }: PlanPickerProps) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [picking, setPicking] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/plans', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed with ${response.status}`)
        return response.json() as Promise<{ plans: PlanSummary[] }>
      })
      .then(({ plans }) => setState({ status: 'ready', plans }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' })
      })

    return () => controller.abort()
  }, [])

  const pick = async (planId: string) => {
    if (picking) return
    setPicking(planId)
    await onPick(planId)
    setPicking(undefined)
  }

  // Date keys are YYYY-MM-DD, so they compare chronologically as strings.
  const heading = date === today ? 'What are you training today?' : date < today ? 'What did you train?' : 'What are you training?'

  return (
    <section aria-labelledby="plan-picker-heading">
      <h2 id="plan-picker-heading" className="px-1 text-[17px] font-bold tracking-[-0.01em]">
        {heading}
      </h2>
      <p className="mt-0.5 mb-3.5 px-1 text-sm text-ink-480">Pick a plan to start logging. Sets, reps and weights carry over from last time, so just change what went up.</p>

      {state.status === 'loading' && <p className="animate-pulse-soft px-1 text-sm text-sand-600">Loading plans…</p>}
      {state.status === 'error' && <p className="px-1 text-sm text-red-accent">Could not load your plans. Refresh to try again.</p>}
      {state.status === 'ready' && state.plans.length === 0 && (
        <div className="rounded-2xl border border-dashed border-sand-820 px-4.5 py-8 text-center text-sm text-ink-480">
          You don&apos;t have any plans yet. <Link href="/plans/new">Create your first plan</Link> to start logging.
        </div>
      )}
      {state.status === 'ready' && state.plans.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {state.plans.map((plan) => (
            <li key={plan.id} className="animate-in-200">
              <button
                type="button"
                onClick={() => pick(plan.id)}
                disabled={Boolean(picking)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-sand-900 bg-sand-1000 px-4.5 py-4 text-left shadow-card transition-colors hover:border-teal-tint-border hover:bg-teal-hover-bg disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{plan.name}</span>
                  <span className="mt-0.5 block font-mono text-xs text-sand-600">
                    {plural(plan.exerciseCount, 'exercise')} · {plural(plan.setCount, 'set')}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-teal-deep">
                  {picking === plan.id ? 'Starting…' : 'Start →'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
