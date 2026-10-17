// Log days are calendar dates in the user's local time, keyed as YYYY-MM-DD. Everything here
// works on local dates (never UTC), so "today" is the day it is where the user is standing.

const pad = (value: number) => String(value).padStart(2, '0')

export const toDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export const fromDateKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export const todayKey = () => toDateKey(new Date())

export const addDays = (key: string, days: number) => {
  const date = fromDateKey(key)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

/** The Monday of the week containing `key`. */
export const startOfWeek = (key: string) => addDays(key, -((fromDateKey(key).getDay() + 6) % 7))

// Dates are formatted by hand rather than with toLocaleDateString: the server and the browser
// disagree on locale and ICU data (e.g. "Mon, 5 Oct" vs "Mon 5 Oct"), which breaks hydration.
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** e.g. "M" for Monday. */
export const narrowWeekday = (key: string) => WEEKDAYS[fromDateKey(key).getDay()][0]

/** e.g. "Friday 9 October 2026". */
export function fullDate(key: string) {
  const date = fromDateKey(key)
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/** "Today", "Yesterday", "Tomorrow", or e.g. "Fri 9 Oct". */
export function dayLabel(key: string, today: string) {
  if (key === today) return 'Today'
  if (key === addDays(today, -1)) return 'Yesterday'
  if (key === addDays(today, 1)) return 'Tomorrow'
  const date = fromDateKey(key)
  return `${WEEKDAYS[date.getDay()].slice(0, 3)} ${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}`
}

/** e.g. "9 Oct" — or "9 Oct 2025" outside the current year. */
export function shortDate(key: string, today: string) {
  const date = fromDateKey(key)
  const sameYear = date.getFullYear() === fromDateKey(today).getFullYear()
  const label = `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}`
  return sameYear ? label : `${label} ${date.getFullYear()}`
}
