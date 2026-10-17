'use client'

import { useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { requestCodeSchema, safeNextPath, SIGN_IN_CODE_LENGTH, verifyCodeSchema } from '@/lib/auth-schema'

type Step = { name: 'email' } | { name: 'code'; email: string }

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

/** Sign in (or sign up) with an emailed code: enter your email, then the code it gets. */
export function SignInForm() {
  const searchParams = useSearchParams()
  const [step, setStep] = useState<Step>({ name: 'email' })
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [busy, setBusy] = useState<false | 'sending' | 'verifying'>(false)

  const sendCode = async (address: string) => {
    const response = await fetch('/api/auth/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: address }),
    })
    if (!response.ok) throw new Error(await errorMessage(response, 'Could not send the code. Try again.'))
  }

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return

    const parsed = requestCodeSchema.safeParse({ email })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }

    setError(undefined)
    setBusy('sending')
    try {
      await sendCode(parsed.data.email)
      setCode('')
      setNotice(undefined)
      setStep({ name: 'code', email: parsed.data.email })
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || step.name !== 'code') return

    const parsed = verifyCodeSchema.safeParse({ email: step.email, code })
    if (!parsed.success) {
      setError(parsed.error.issues[0].message)
      return
    }

    setError(undefined)
    setNotice(undefined)
    setBusy('verifying')
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      if (!response.ok) throw new Error(await errorMessage(response, 'Could not sign in. Try again.'))

      // A full page load, so the app starts fresh with the new session's cookies.
      window.location.replace(safeNextPath(searchParams.get('next')))
    } catch (failure) {
      setError((failure as Error).message)
      setBusy(false)
    }
  }

  const resend = async () => {
    if (busy || step.name !== 'code') return

    setError(undefined)
    setNotice(undefined)
    setBusy('sending')
    try {
      await sendCode(step.email)
      setNotice('A new code is on its way.')
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const changeEmail = () => {
    setError(undefined)
    setNotice(undefined)
    setStep({ name: 'email' })
  }

  const card = 'rounded-2xl border border-sand-900 bg-sand-1000 px-4.5 py-4 shadow-card'

  if (step.name === 'email') {
    return (
      <form onSubmit={submitEmail} noValidate className={card}>
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
        {error && (
          <p id="sign-in-error" role="alert" className="mt-1.5 text-[13px] text-red-accent">
            {error}
          </p>
        )}
        <button type="submit" className={submitClass} disabled={Boolean(busy)}>
          {busy ? 'Sending…' : 'Email me a code'}
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={submitCode} noValidate className={card}>
      <p className="mb-3 text-sm text-ink-480">
        We sent a {SIGN_IN_CODE_LENGTH}-digit code to <span className="font-semibold text-ink-240">{step.email}</span>. It
        expires in 10 minutes.
      </p>
      <label htmlFor="sign-in-code" className="mb-1.5 block text-sm font-semibold">
        Code
      </label>
      <input
        id="sign-in-code"
        className={`${inputClass} text-center font-mono text-xl tracking-[0.4em]`}
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, SIGN_IN_CODE_LENGTH))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder={'0'.repeat(SIGN_IN_CODE_LENGTH)}
        maxLength={SIGN_IN_CODE_LENGTH}
        autoFocus
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'sign-in-error' : undefined}
      />
      {error && (
        <p id="sign-in-error" role="alert" className="mt-1.5 text-[13px] text-red-accent">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-1.5 text-[13px] text-teal-tint-text">
          {notice}
        </p>
      )}
      <button type="submit" className={submitClass} disabled={Boolean(busy)}>
        {busy === 'verifying' ? 'Checking…' : 'Sign in'}
      </button>
      <div className="mt-3 flex justify-between gap-3">
        <button type="button" onClick={changeEmail} disabled={Boolean(busy)} className={linkButtonClass}>
          Use a different email
        </button>
        <button type="button" onClick={resend} disabled={Boolean(busy)} className={linkButtonClass}>
          {busy === 'sending' ? 'Sending…' : 'Send a new code'}
        </button>
      </div>
    </form>
  )
}
