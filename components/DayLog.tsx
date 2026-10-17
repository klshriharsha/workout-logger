'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LogEditor } from '@/components/LogEditor'
import { PlanPicker } from '@/components/PlanPicker'
import { Toast } from '@/components/Toast'
import { useToast } from '@/hooks/useToast'
import { addDays, dayLabel, fromDateKey, fullDate, narrowWeekday, startOfWeek, todayKey } from '@/lib/dates'
import { logDateSchema, type LogSummary, type WorkoutLog } from '@/lib/log-schema'

const dayHref = (key: string, today: string) => (key === today ? '/' : `/?date=${key}`)

/** The per-day logging screen: pick a day, pick that day's plan, then log it. */
export function DayLog() {
  const searchParams = useSearchParams()
  const [today] = useState(todayKey)
  const requested = logDateSchema.safeParse(searchParams.get('date'))
  const date = requested.success ? requested.data : today

  // Which days of the visible week have a log, for the dots under the week strip.
  const weekStart = startOfWeek(date)
  const [loggedDays, setLoggedDays] = useState<{ weekStart: string; plans: Map<string, string> }>()

  useEffect(() => {
    const controller = new AbortController()

    fetch(`/api/logs?from=${weekStart}&to=${addDays(weekStart, 6)}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed with ${response.status}`)
        return response.json() as Promise<{ logs: LogSummary[] }>
      })
      .then(({ logs }) => setLoggedDays({ weekStart, plans: new Map(logs.map((log) => [log.date, log.planName])) }))
      .catch(() => {
        // The dots are a nicety; the day itself still loads and reports its own errors.
      })

    return () => controller.abort()
  }, [weekStart])

  const markDay = (day: string, planName: string | null) =>
    setLoggedDays((current) => {
      if (!current) return current
      const plans = new Map(current.plans)
      if (planName === null) plans.delete(day)
      else plans.set(day, planName)
      return { ...current, plans }
    })

  return (
    <>
      <WeekStrip
        date={date}
        today={today}
        loggedDays={loggedDays?.weekStart === weekStart ? loggedDays.plans : undefined}
      />
      <DayContent key={date} date={date} today={today} onLogChange={(planName) => markDay(date, planName)} />
    </>
  )
}

function WeekStrip({ date, today, loggedDays }: { date: string; today: string; loggedDays?: Map<string, string> }) {
  const weekStart = startOfWeek(date)
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))

  return (
    <nav aria-label="Pick a day" className="mb-5">
      <div className="mb-3 flex items-end justify-between gap-3 px-1">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em]">{dayLabel(date, today)}</h1>
          <p className="mt-0.5 font-mono text-[11px] tracking-[0.1em] text-sand-600 uppercase">{fullDate(date)}</p>
        </div>
        {date !== today && (
          <Link
            href="/"
            replace
            scroll={false}
            className="shrink-0 rounded-lg border border-sand-880 bg-sand-1000 px-3 py-1.5 text-sm font-semibold text-teal-deep hover:bg-teal-hover-bg hover:no-underline"
          >
            Today
          </Link>
        )}
      </div>

      <div className="flex items-stretch gap-1 rounded-2xl border border-sand-900 bg-sand-1000 p-1.5 shadow-card">
        <ArrowLink href={dayHref(addDays(date, -7), today)} label="Previous week" direction="left" />
        <ol className="grid flex-1 grid-cols-7 gap-0.5">
          {days.map((day) => {
            const selected = day === date
            const planName = loggedDays?.get(day)
            const weekday = narrowWeekday(day)

            return (
              <li key={day}>
                <Link
                  href={dayHref(day, today)}
                  replace
                  scroll={false}
                  aria-current={selected ? 'date' : undefined}
                  aria-label={`${dayLabel(day, today)}${planName ? ` — ${planName} logged` : ''}`}
                  className={`flex h-full flex-col items-center gap-0.5 rounded-xl py-1.5 transition-colors hover:no-underline ${
                    selected ? 'bg-teal-deep text-teal-on-accent' : 'text-ink-420 hover:bg-sand-950 hover:text-ink-240'
                  }`}
                >
                  <span className={`font-mono text-[10px] tracking-[0.08em] uppercase ${selected ? 'opacity-80' : 'text-sand-600'}`}>
                    {weekday}
                  </span>
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full text-[15px] font-semibold ${
                      day === today && !selected ? 'ring-[1.5px] ring-teal-accent text-teal-deep' : ''
                    }`}
                  >
                    {fromDateKey(day).getDate()}
                  </span>
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 rounded-full ${planName ? (selected ? 'bg-amber-muted' : 'bg-amber-accent') : 'bg-transparent'}`}
                  />
                </Link>
              </li>
            )
          })}
        </ol>
        <ArrowLink href={dayHref(addDays(date, 7), today)} label="Next week" direction="right" />
      </div>
    </nav>
  )
}

function ArrowLink({ href, label, direction }: { href: string; label: string; direction: 'left' | 'right' }) {
  return (
    <Link
      href={href}
      replace
      scroll={false}
      aria-label={label}
      className="grid w-8 shrink-0 place-items-center rounded-xl text-sand-600 transition-colors hover:bg-sand-950 hover:text-ink-240"
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d={direction === 'left' ? 'M12.5 4.5L7 10l5.5 5.5' : 'M7.5 4.5L13 10l-5.5 5.5'} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  )
}

type DayState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; log: WorkoutLog | null }

type DayContentProps = {
  date: string
  today: string
  /** Called with the plan name when a log is started, or null when the day is cleared. */
  onLogChange: (planName: string | null) => void
}

function DayContent({ date, today, onLogChange }: DayContentProps) {
  const [state, setState] = useState<DayState>({ status: 'loading' })
  const { toast, flash } = useToast()

  useEffect(() => {
    const controller = new AbortController()

    fetchLog(date, controller.signal)
      .then((log) => setState({ status: 'ready', log }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' })
      })

    return () => controller.abort()
  }, [date])

  const startLog = async (planId: string) => {
    try {
      const response = await fetch(`/api/logs/${date}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })

      // Already started (e.g. in another tab): show what's there instead.
      const log = response.status === 409 ? await fetchLog(date) : await readStartedLog(response)
      if (!log) throw new Error('Log missing after start')

      setState({ status: 'ready', log })
      onLogChange(log.planName)
    } catch {
      flash('Could not start the workout. Try again.')
    }
  }

  const clearLog = async () => {
    try {
      const response = await fetch(`/api/logs/${date}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(`Request failed with ${response.status}`)

      setState({ status: 'ready', log: null })
      onLogChange(null)
    } catch {
      flash('Could not clear the day. Try again.')
    }
  }

  return (
    <>
      {state.status === 'loading' && <p className="animate-pulse-soft px-1 text-sm text-sand-600">Loading…</p>}
      {state.status === 'error' && <p className="px-1 text-sm text-red-accent">Could not load this day. Refresh to try again.</p>}
      {state.status === 'ready' &&
        (state.log ? (
          <LogEditor log={state.log} today={today} onClear={clearLog} />
        ) : (
          <PlanPicker date={date} today={today} onPick={startLog} />
        ))}
      <Toast message={toast} />
    </>
  )
}

async function fetchLog(date: string, signal?: AbortSignal) {
  const response = await fetch(`/api/logs/${date}`, { signal })
  if (!response.ok) throw new Error(`Request failed with ${response.status}`)
  const { log } = (await response.json()) as { log: WorkoutLog | null }
  return log
}

async function readStartedLog(response: Response) {
  if (!response.ok) throw new Error(`Request failed with ${response.status}`)
  const { log } = (await response.json()) as { log: WorkoutLog | null }
  return log
}
