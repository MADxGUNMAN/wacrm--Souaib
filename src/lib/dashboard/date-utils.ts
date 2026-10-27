// Centralised date helpers for the dashboard so every chart / card
// agrees on what "today", "day boundary", and "day of week" mean.
// All boundaries are computed in the user's LOCAL timezone — which is
// what a business user intuitively expects when they say "today".
//
// ─── Optional explicit timezone ──────────────────────────────────
//
// The dashboard runs in the browser, so "local" there is the user's own
// zone. The AI connector computes the same numbers on the SERVER, whose
// local zone is UTC in the container — "today" would start at 05:30 IST
// and the AI would disagree with the dashboard every morning. So every
// helper takes an optional `{ timeZone, now }`. Without a timeZone the
// behaviour is exactly the old local-time behaviour; with one, the same
// boundaries are computed for that IANA zone.

export interface DayOpts {
  /** IANA zone, e.g. 'Asia/Kolkata'. Omit for the runtime's local zone. */
  timeZone?: string
  /** Reference instant; defaults to now. */
  now?: Date
}

interface WallClock {
  y: number
  m: number // 1–12
  d: number
  h: number
  mi: number
  s: number
  /** 0 = Sunday … 6 = Saturday */
  wd: number
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
      hourCycle: 'h23',
    })
    formatters.set(timeZone, f)
  }
  return f
}

/** True when `timeZone` is a zone this runtime knows. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone)
    return true
  } catch {
    return false
  }
}

function wallClock(date: Date, timeZone: string): WallClock {
  const parts: Record<string, string> = {}
  for (const p of formatter(timeZone).formatToParts(date)) parts[p.type] = p.value
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour) % 24,
    mi: Number(parts.minute),
    s: Number(parts.second),
    wd: WEEKDAYS.indexOf(parts.weekday),
  }
}

/** Offset of `timeZone` from UTC at instant `t`, in ms (IST = +19 800 000). */
function offsetMs(t: number, timeZone: string): number {
  const w = wallClock(new Date(t), timeZone)
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s)
  return asUtc - (t - (((t % 1000) + 1000) % 1000))
}

/** The instant of 00:00 on calendar day (y, m, d) in `timeZone`. */
function zonedMidnight(y: number, m: number, d: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d)
  // Two passes settle the offset across a DST change.
  let t = guess - offsetMs(guess, timeZone)
  t = guess - offsetMs(t, timeZone)
  return new Date(t)
}

export function startOfLocalDay(d: Date = new Date(), timeZone?: string): Date {
  if (timeZone) {
    const w = wallClock(d, timeZone)
    return zonedMidnight(w.y, w.m, w.d, timeZone)
  }
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

export function daysAgoStart(days: number, opts: DayOpts = {}): Date {
  const now = opts.now ?? new Date()
  if (opts.timeZone) {
    const w = wallClock(now, opts.timeZone)
    // Date.UTC normalises an out-of-range day (e.g. -3) across months.
    const day = new Date(Date.UTC(w.y, w.m - 1, w.d - days))
    return zonedMidnight(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), opts.timeZone)
  }
  const out = startOfLocalDay(now)
  out.setDate(out.getDate() - days)
  return out
}

/** Date-only key (YYYY-MM-DD) for bucketing rows by local calendar day. */
export function localDayKey(d: Date | string, timeZone?: string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  if (timeZone) {
    const w = wallClock(date, timeZone)
    return `${w.y}-${String(w.m).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`
  }
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Inclusive list of local-day keys spanning the last `n` days, in
 * chronological order. Useful for seeding chart buckets so days with
 * zero activity still render a 0-point in the line.
 */
export function lastNDayKeys(n: number, opts: DayOpts = {}): string[] {
  if (opts.timeZone) {
    const w = wallClock(opts.now ?? new Date(), opts.timeZone)
    const keys: string[] = []
    for (let i = n - 1; i >= 0; i--) {
      const day = new Date(Date.UTC(w.y, w.m - 1, w.d - i))
      keys.push(day.toISOString().slice(0, 10))
    }
    return keys
  }
  const keys: string[] = []
  const start = daysAgoStart(n - 1, opts)
  for (let i = 0; i < n; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    keys.push(localDayKey(d))
  }
  return keys
}

/**
 * ISO day-of-week where 0 = Monday … 6 = Sunday. JavaScript's native
 * getDay() uses 0 = Sunday which is awkward for most business charts.
 */
export function mondayIndex(d: Date, timeZone?: string): number {
  const jsDow = timeZone ? wallClock(d, timeZone).wd : d.getDay() // 0..6 with Sunday=0
  return (jsDow + 6) % 7
}

export const DOW_SHORT_MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
