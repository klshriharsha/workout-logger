'use client'

import { useEffect, useRef, useState } from 'react'
import { Toast } from '@/components/Toast'
import { useToast } from '@/hooks/useToast'

type AccountMenuProps = {
  email: string
}

/** The signed-in account in the header: who you are, and a way to sign out. */
export function AccountMenu({ email }: AccountMenuProps) {
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const { toast, flash } = useToast()
  const container = useRef<HTMLDivElement>(null)

  // Closes on a tap outside the menu or on Escape.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const signOut = async () => {
    if (signingOut) return
    setSigningOut(true)

    try {
      const response = await fetch('/api/auth/sign-out', { method: 'POST' })
      if (!response.ok) throw new Error(`Request failed with ${response.status}`)

      // A full page load rather than a client navigation, so nothing of this account's data is
      // left in memory (or in the router cache) for whoever signs in next.
      window.location.replace('/sign-in')
    } catch {
      flash('Could not sign out. Try again.')
      setSigningOut(false)
    }
  }

  return (
    <div ref={container} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Account"
        className="grid h-8 w-8 place-items-center rounded-full border border-teal-tint-border bg-teal-tint text-sm font-bold text-teal-tint-text uppercase transition-colors hover:bg-teal-hover-bg"
      >
        {email[0]}
      </button>

      {open && (
        <div className="absolute top-[calc(100%+10px)] right-0 w-64 max-w-[calc(100vw-32px)] animate-in-140 rounded-xl border border-sand-900 bg-sand-1000 p-1.5 shadow-dropdown">
          <p className="px-2.5 pt-1.5 font-mono text-[11px] tracking-[0.1em] text-sand-600 uppercase">Signed in as</p>
          <p className="truncate px-2.5 pt-0.5 pb-2 text-sm font-semibold" title={email}>
            {email}
          </p>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="w-full rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-ink-450 transition-colors hover:bg-red-hover-bg hover:text-red-hover-text disabled:opacity-60"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}

      <Toast message={toast} />
    </div>
  )
}
