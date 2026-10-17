import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { AccountMenu } from '@/components/AccountMenu'
import { Logo } from '@/components/Logo'
import { getSessionUser } from '@/lib/session'

type AppHeaderProps = {
  /** Which section of the app the page belongs to, highlighted in the nav. */
  active: 'log' | 'history' | 'plans'
}

const navItems = [
  { section: 'log', href: '/', label: 'Log' },
  { section: 'history', href: '/history', label: 'History' },
  { section: 'plans', href: '/plans', label: 'Plans' },
] as const

export function AppHeader({ active }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-[60] border-b border-sand-900 bg-sand-972/88 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-180 items-center gap-3.5 px-[clamp(16px,4vw,28px)]">
        <div className="flex items-center gap-2.5">
          <Logo className="h-6.5 w-6.5" />
          {/* On narrow phones the mark alone carries the brand, to leave room for the nav and account. */}
          <span className="text-lg font-bold tracking-[-0.02em] max-[440px]:sr-only">Workout Logger</span>
        </div>
        <nav className="ml-auto flex gap-5 self-stretch" aria-label="Main">
          {navItems.map((item) => (
            <Link
              key={item.section}
              href={item.href}
              aria-current={item.section === active ? 'page' : undefined}
              className="relative flex items-center px-0.5 text-sm font-semibold text-ink-450 transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors hover:text-ink-240 hover:no-underline not-aria-[current=page]:hover:after:bg-teal-tint-border aria-[current=page]:text-teal-deep aria-[current=page]:after:bg-teal-accent"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {/* Who's signed in comes from the request's cookies, so it streams in after the static shell. */}
        <Suspense fallback={<span className="h-8 w-8 shrink-0 rounded-full bg-sand-930" aria-hidden />}>
          <Account />
        </Suspense>
      </div>
    </header>
  )
}

async function Account() {
  // Checking the session reads the database (and its expiry, the clock), which a prerender — even
  // one that has the cookies, like a runtime prefetch — mustn't do. Wait for the real request.
  await connection()
  const user = await getSessionUser()

  // The proxy only lets signed-in visitors reach pages with this header.
  if (!user) return null

  return <AccountMenu email={user.email} />
}
