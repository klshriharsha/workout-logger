import type { Metadata } from 'next'
import { AppHeader } from '@/components/AppHeader'
import { HistoryOverview } from '@/components/HistoryOverview'

export const metadata: Metadata = {
  title: 'History · Workout Logger',
}

export default function HistoryPage() {
  return (
    <div className="min-h-screen bg-sand-972 pb-16 font-sans text-ink-240">
      <AppHeader active="history" />

      <main className="mx-auto max-w-180 px-[clamp(16px,4vw,28px)] pt-[clamp(20px,4vw,36px)]">
        <h1 className="text-[22px] font-bold tracking-[-0.02em]">Your progress</h1>
        <p className="mt-1 mb-5 text-sm text-ink-480">How often you train, and how your lifts are moving.</p>

        <HistoryOverview />
      </main>
    </div>
  )
}
