import type { Metadata } from 'next'
import Link from 'next/link'
import { AppHeader } from '@/components/AppHeader'
import { PlanList } from '@/components/PlanList'

export const metadata: Metadata = {
  title: 'Plans · Workout Logger',
}

export default function PlansPage() {
  return (
    <div className="min-h-screen bg-sand-972 pb-16 font-sans text-ink-240">
      <AppHeader active="plans" />

      <main className="mx-auto max-w-180 px-[clamp(16px,4vw,28px)] pt-[clamp(20px,4vw,36px)]">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold tracking-[-0.02em]">Your workout plans</h1>
            <p className="mt-1 text-sm text-ink-480">One plan per training day.</p>
          </div>
          <Link
            href="/plans/new"
            className="shrink-0 rounded-lg bg-teal-deep px-4 py-2.5 text-sm font-semibold text-teal-on-accent shadow-cta transition-colors hover:bg-teal-deep-hover hover:no-underline"
          >
            + New plan
          </Link>
        </div>

        <PlanList />
      </main>
    </div>
  )
}
