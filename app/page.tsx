import { Suspense } from 'react'
import { AppHeader } from '@/components/AppHeader'
import { DayLog } from '@/components/DayLog'

export default function TodayPage() {
  return (
    <div className="min-h-screen bg-sand-972 pb-16 font-sans text-ink-240">
      <AppHeader active="log" />

      <main className="mx-auto max-w-180 px-[clamp(16px,4vw,28px)] pt-[clamp(16px,3vw,28px)]">
        {/* The day comes from ?date= and the user's local clock, so it's only known in the browser. */}
        <Suspense fallback={<p className="animate-pulse-soft px-1 text-sm text-sand-600">Loading…</p>}>
          <DayLog />
        </Suspense>
      </main>
    </div>
  )
}
