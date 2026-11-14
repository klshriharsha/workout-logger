'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { PlanForm } from '@/components/PlanForm'
import type { Plan } from '@/lib/plan-schema'

type State = { status: 'loading' } | { status: 'error' } | { status: 'missing' } | { status: 'ready'; plan: Plan }

/** Loads the plan named by the [id] segment into the plan form. */
export function PlanEditor() {
  const { id } = useParams<{ id: string }>()
  const [state, setState] = useState<State>({ status: 'loading' })

  // With Cache Components, leaving this page hides it (React Activity) rather than unmounting it,
  // re-running this effect on the next visit. Dropping back to "loading" on the way out means a
  // revisit opens the plan as it's now saved, not a stale copy of the form.
  useEffect(() => {
    const controller = new AbortController()

    fetch(`/api/plans/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then((response) => {
        if (response.status === 404) return null
        if (!response.ok) throw new Error(`Request failed with ${response.status}`)
        return response.json() as Promise<{ plan: Plan }>
      })
      .then((body) => setState(body ? { status: 'ready', plan: body.plan } : { status: 'missing' }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' })
      })

    return () => {
      controller.abort()
      setState({ status: 'loading' })
    }
  }, [id])

  if (state.status === 'loading') {
    return <p className="animate-pulse-soft px-1 text-sm text-sand-600">Loading plan…</p>
  }

  if (state.status === 'missing') {
    return <p className="px-1 text-sm text-ink-480">This plan doesn&apos;t exist, or was deleted.</p>
  }

  if (state.status === 'error') {
    return <p className="px-1 text-sm text-red-accent">Could not load this plan. Refresh to try again.</p>
  }

  return <PlanForm plan={state.plan} />
}
