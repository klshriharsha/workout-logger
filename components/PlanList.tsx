'use client'

import { useEffect, useState } from 'react'
import { plural } from '@/lib/format'
import type { PlanSummary } from '@/lib/plan-schema'

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; plans: PlanSummary[] }

export function PlanList() {
  const [state, setState] = useState<State>({ status: 'loading' })

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

  if (state.status === 'loading') {
    return <p className="animate-pulse-soft px-1 text-sm text-sand-600">Loading plans…</p>
  }

  if (state.status === 'error') {
    return <p className="px-1 text-sm text-red-accent">Could not load your plans. Refresh to try again.</p>
  }

  if (state.plans.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-sand-820 px-4.5 py-8 text-center text-sm text-ink-480">
        No plans yet. Create one for each training day — upper, lower, push, pull, legs…
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {state.plans.map((plan) => (
        <li
          key={plan.id}
          className="animate-in-200 flex items-center justify-between gap-3 rounded-2xl border border-sand-900 bg-sand-1000 px-4.5 py-3.5 shadow-card"
        >
          <span className="truncate text-[15px] font-semibold">{plan.name}</span>
          <span className="shrink-0 font-mono text-xs text-sand-600">
            {plural(plan.exerciseCount, 'exercise')} · {plural(plan.setCount, 'set')}
          </span>
        </li>
      ))}
    </ul>
  )
}
