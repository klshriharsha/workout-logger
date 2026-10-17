'use client'

import { useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { PASSWORD_MIN_LENGTH, safeNextPath, signInSchema, signUpSchema } from '@/lib/auth-schema'

type Mode = 'sign-in' | 'sign-up'

const inputClass =
  'w-full rounded-lg border border-sand-880 bg-sand-1000 px-3 py-2.5 text-[15px] text-ink-240 outline-none transition-colors placeholder:text-sand-680 focus:border-teal-accent aria-invalid:border-red-accent'

const submitClass =
  'mt-3 w-full rounded-lg bg-teal-deep px-4 py-2.5 text-sm font-semibold text-teal-on-accent shadow-cta transition-colors hover:bg-teal-deep-hover disabled:opacity-60'

const linkButtonClass = 'text-sm font-semibold text-teal-deep hover:text-teal-link-hover disabled:opacity-60'

/** The API's error message, if it sent one. */
async function errorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined
  return response.status < 500 && body?.error ? body.error : fallback
}

/** Sign in with an email and password, or create an account with them. */
export function SignInForm() {
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const signingUp = mode === 'sign-up'

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return

    const parsed = (signingUp ? signUpSchema : signInSchema).safeParse({ email, password })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }

    setError(undefined)
    setBusy(true)
    try {
      const response = await fetch(signingUp ? '/api/auth/sign-up' : '/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      if (!response.ok) throw new Error(await errorMessage(response, 'Could not sign in. Try again.'))

      // A full page load, so the app starts fresh with the new session's cookie.
      window.location.replace(safeNextPath(searchParams.get('next')))
    } catch (failure) {
      setError((failure as Error).message)
      setBusy(false)
    }
  }

  const switchMode = () => {
    setError(undefined)
    setMode(signingUp ? 'sign-in' : 'sign-up')
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="rounded-2xl border border-sand-900 bg-sand-1000 px-4.5 py-4 shadow-card"
    >
      <label htmlFor="sign-in-email" className="mb-1.5 block text-sm font-semibold">
        Email
      </label>
      <input
        id="sign-in-email"
        type="email"
        className={inputClass}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'sign-in-error' : undefined}
      />
      <label htmlFor="sign-in-password" className="mt-3 mb-1.5 block text-sm font-semibold">
        Password
      </label>
      <input
        id="sign-in-password"
        type="password"
        className={inputClass}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder={signingUp ? `At least ${PASSWORD_MIN_LENGTH} characters` : undefined}
        autoComplete={signingUp ? 'new-password' : 'current-password'}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'sign-in-error' : undefined}
      />
      {error && (
        <p id="sign-in-error" role="alert" className="mt-1.5 text-[13px] text-red-accent">
          {error}
        </p>
      )}
      <button type="submit" className={submitClass} disabled={busy}>
        {signingUp ? (busy ? 'Creating account…' : 'Create account') : busy ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="mt-3 text-center text-sm text-ink-480">
        {signingUp ? 'Already have an account? ' : 'New here? '}
        <button type="button" onClick={switchMode} disabled={busy} className={linkButtonClass}>
          {signingUp ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </form>
  )
}
