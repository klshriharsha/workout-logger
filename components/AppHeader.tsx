import Link from 'next/link'

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
          <svg className="h-6.5 w-6.5" viewBox="0 0 512 512" role="img" aria-label="Workout Logger">
            <rect width="512" height="512" rx="116" fill="#0f766e" />
            <g fill="#ffffff">
              <rect x="96" y="238" width="320" height="36" rx="18" />
              <rect x="92" y="166" width="54" height="180" rx="20" />
              <rect x="366" y="166" width="54" height="180" rx="20" />
              <rect x="58" y="206" width="34" height="100" rx="14" />
              <rect x="420" y="206" width="34" height="100" rx="14" />
            </g>
            <rect x="196" y="226" width="120" height="60" rx="22" fill="#e6902f" />
          </svg>
          <span className="text-lg font-bold tracking-[-0.02em]">Workout Logger</span>
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
      </div>
    </header>
  )
}
