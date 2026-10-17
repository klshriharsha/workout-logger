'use client'

import Link from 'next/link'
import { useState } from 'react'
import { addDays, dayLabel, fromDateKey, startOfWeek, toDateKey } from '@/lib/dates'
import { plural } from '@/lib/format'
import type { WorkoutDay } from '@/lib/progress'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// Literal class names so Tailwind generates them. Slots go to plans in a fixed order (see
// planSlots); the rest share the last entry.
const PLAN_COLORS = ['bg-plan-1', 'bg-plan-2', 'bg-plan-3', 'bg-plan-other']

/**
 * A color slot per plan, given to the plans trained most (ties to the one used first), so a
 * plan's color stays the same from month to month. Only three colors stay distinguishable for
 * colorblind users side by side; any other plans share a neutral one.
 */
function planSlots(days: WorkoutDay[]) {
  const counts = new Map<string, number>()
  for (const day of days) counts.set(day.planName, (counts.get(day.planName) ?? 0) + 1)

  // Map keeps insertion order, i.e. first use, and sort is stable.
  const ranked = [...counts].sort((a, b) => b[1] - a[1]).map(([planName]) => planName)
  return new Map(ranked.map((planName, index) => [planName, Math.min(index, PLAN_COLORS.length - 1)]))
}

/** "YYYY-MM" for the month containing `key`. */
const monthOf = (key: string) => key.slice(0, 7)

const shiftMonth = (month: string, by: number) => {
  const [year, monthIndex] = month.split('-').map(Number)
  return toDateKey(new Date(year, monthIndex - 1 + by, 1)).slice(0, 7)
}

const dayHref = (key: string, today: string) => (key === today ? '/' : `/?date=${key}`)

/** A month of training days, each marked with its plan's color and linking to that day's log. */
export function HistoryCalendar({ days, today }: { days: WorkoutDay[]; today: string }) {
  const [month, setMonth] = useState(() => monthOf(today))
  const slots = planSlots(days)
  const plans = new Map(days.map((day) => [day.date, day.planName]))

  const firstMonth = monthOf(days[0]?.date ?? today)
  const lastMonth = monthOf(today)

  // Whole weeks, Monday first, from the week the month starts in to the week it ends in.
  const cells: string[] = []
  for (let day = startOfWeek(`${month}-01`); monthOf(day) <= month || cells.length % 7 !== 0; day = addDays(day, 1)) {
    cells.push(day)
  }

  const monthDays = days.filter((day) => monthOf(day.date) === month)
  const monthPlans = new Map<string, number>()
  for (const day of monthDays) monthPlans.set(day.planName, (monthPlans.get(day.planName) ?? 0) + 1)

  const [year, monthIndex] = month.split('-').map(Number)

  return (
    <section aria-labelledby="calendar-heading" className="rounded-2xl border border-sand-900 bg-sand-1000 p-3.5 shadow-card">
      <div className="mb-2.5 flex items-center gap-2">
        <MonthButton label="Previous month" direction="left" disabled={month <= firstMonth} onClick={() => setMonth(shiftMonth(month, -1))} />
        <div className="flex-1 text-center">
          <h2 id="calendar-heading" aria-live="polite" className="text-[15px] font-bold">
            {MONTHS[monthIndex - 1]} {year}
          </h2>
          <p className="font-mono text-[11px] text-sand-600">{plural(monthDays.length, 'workout')}</p>
        </div>
        <MonthButton label="Next month" direction="right" disabled={month >= lastMonth} onClick={() => setMonth(shiftMonth(month, 1))} />
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((weekday, index) => (
          <span key={index} aria-hidden className="pb-1 text-center font-mono text-[10px] tracking-[0.08em] text-sand-600">
            {weekday}
          </span>
        ))}
        {cells.map((day) => {
          if (monthOf(day) !== month) return <span key={day} aria-hidden />

          const planName = plans.get(day)
          const number = fromDateKey(day).getDate()
          const ring = day === today ? 'ring-[1.5px] ring-teal-accent' : ''

          if (!planName) {
            return (
              <span key={day} className={`grid h-12 place-items-center rounded-lg text-sm text-ink-420 ${ring}`}>
                {number}
              </span>
            )
          }

          return (
            <Link
              key={day}
              href={dayHref(day, today)}
              aria-label={`${dayLabel(day, today)}, ${planName}`}
              title={planName}
              className={`flex h-12 flex-col items-center justify-center gap-1 rounded-lg bg-teal-tint text-sm font-semibold text-ink-240 transition-colors hover:bg-teal-tint-border hover:text-ink-240 hover:no-underline ${ring}`}
            >
              {number}
              <span aria-hidden className={`h-2 w-2 rounded-full ${PLAN_COLORS[slots.get(planName) ?? PLAN_COLORS.length - 1]}`} />
            </Link>
          )
        })}
      </div>

      {monthPlans.size > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-sand-930 px-0.5 pt-3" aria-label="Plans this month">
          {[...monthPlans].map(([planName, count]) => (
            <li key={planName} className="flex items-center gap-1.5 text-xs text-ink-450">
              <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${PLAN_COLORS[slots.get(planName) ?? PLAN_COLORS.length - 1]}`} />
              <span className="max-w-40 truncate">{planName}</span>
              <span className="font-mono text-sand-600">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

type MonthButtonProps = { label: string; direction: 'left' | 'right'; disabled: boolean; onClick: () => void }

function MonthButton({ label, direction, disabled, onClick }: MonthButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-9 w-9 place-items-center rounded-xl text-sand-600 transition-colors hover:bg-sand-950 hover:text-ink-240 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d={direction === 'left' ? 'M12.5 4.5L7 10l5.5 5.5' : 'M7.5 4.5L13 10l-5.5 5.5'} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}
