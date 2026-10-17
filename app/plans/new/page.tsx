import type { Metadata } from 'next'
import Link from 'next/link'
import { AppHeader } from '@/components/AppHeader'
import { PlanForm } from '@/components/PlanForm'

export const metadata: Metadata = {
  title: 'New plan · Workout Logger',
}

export default function NewPlanPage() {
  return (
    <div className="min-h-screen bg-sand-972 pb-16 font-sans text-ink-240">
      <AppHeader active="plans" />

      <main className="mx-auto max-w-180 px-[clamp(16px,4vw,28px)] pt-[clamp(20px,4vw,36px)]">
        <Link href="/plans" className="font-mono text-[11px] tracking-[0.1em] text-sand-600 uppercase hover:text-teal-deep hover:no-underline">
          ← All plans
        </Link>
        <h1 className="mt-2 mb-1 text-[22px] font-bold tracking-[-0.02em]">New workout plan</h1>
        <p className="mb-5 text-sm text-ink-480">
          Add the exercises for this training day, with how many sets and reps you&apos;re aiming for on each.
        </p>

        <PlanForm />
      </main>
    </div>
  )
}
