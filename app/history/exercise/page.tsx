import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { AppHeader } from '@/components/AppHeader'
import { ExerciseProgress } from '@/components/ExerciseProgress'

export const metadata: Metadata = {
  title: 'Exercise history · Workout Logger',
}

export default function ExerciseHistoryPage() {
  return (
    <div className="min-h-screen bg-sand-972 pb-16 font-sans text-ink-240">
      <AppHeader active="history" />

      <main className="mx-auto max-w-180 px-[clamp(16px,4vw,28px)] pt-[clamp(20px,4vw,36px)]">
        <Link href="/history" className="font-mono text-[11px] tracking-[0.1em] text-sand-600 uppercase hover:text-teal-deep hover:no-underline">
          ← History
        </Link>

        {/* The exercise comes from ?name=, which is only known at request time. */}
        <Suspense fallback={<p className="animate-pulse-soft mt-3 px-1 text-sm text-sand-600">Loading…</p>}>
          <ExerciseProgress />
        </Suspense>
      </main>
    </div>
  )
}
