import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Logo } from '@/components/Logo'
import { SignInForm } from '@/components/SignInForm'

export const metadata: Metadata = {
  title: 'Sign in · Workout Logger',
}

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-sand-972 pb-16 font-sans text-ink-240">
      <main className="mx-auto max-w-100 px-4 pt-[calc(env(safe-area-inset-top)+clamp(48px,12vh,112px))]">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="h-12 w-12" />
          <h1 className="mt-4 text-[22px] font-bold tracking-[-0.02em]">Sign in to Workout Logger</h1>
          <p className="mt-1 text-sm text-ink-480">We&apos;ll email you a code. New here? The same code creates your account.</p>
        </div>

        {/* Where to go afterwards comes from ?next=, which is only known in the browser. */}
        <Suspense fallback={<p className="animate-pulse-soft px-1 text-center text-sm text-sand-600">Loading…</p>}>
          <SignInForm />
        </Suspense>
      </main>
    </div>
  )
}
