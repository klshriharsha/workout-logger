import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { AppHeader } from '@/components/AppHeader'
import { PlanEditor } from '@/components/PlanEditor'

export const metadata: Metadata = {
  title: 'Edit plan · Workout Logger',
}

export default function EditPlanPage() {
  return (
    <div className="min-h-screen bg-sand-972 pb-16 font-sans text-ink-240">
      <AppHeader active="plans" />

      <main className="mx-auto max-w-180 px-[clamp(16px,4vw,28px)] pt-[clamp(20px,4vw,36px)]">
        <Link href="/plans" className="font-mono text-[11px] tracking-[0.1em] text-sand-600 uppercase hover:text-teal-deep hover:no-underline">
          ← All plans
        </Link>
        <h1 className="mt-2 mb-1 text-[22px] font-bold tracking-[-0.02em]">Edit workout plan</h1>
        <p className="mb-5 text-sm text-ink-480">
          Changes apply to workouts you start from now on. Days already logged keep the exercises they were started with.
        </p>

        {/* The plan comes from the [id] segment, which is only known at request time. */}
        <Suspense fallback={<p className="animate-pulse-soft px-1 text-sm text-sand-600">Loading plan…</p>}>
          <PlanEditor />
        </Suspense>
      </main>
    </div>
  )
}
