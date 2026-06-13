/**
 * IST (India Standard Time) helpers. UTC+5:30 with no DST — safe to compute
 * by simple offset, but centralised here so we don't sprinkle `+ 5.5h` math
 * around the codebase.
 *
 * Keep this dependency-free.
 */

export const IST_OFFSET_MIN = 5 * 60 + 30 // 330 minutes
export const IST_OFFSET_MS  = IST_OFFSET_MIN * 60 * 1000

/** Returns the current wall-clock instant in IST as a Date. The returned
 * Date's UTC values represent the IST clock (handy for `getUTCHours()` to
 * read the IST hour). */
export function nowIST(now: Date = new Date()): Date {
  return new Date(now.getTime() + IST_OFFSET_MS)
}

/** Current IST hour as a float (e.g. 15.5 = 3:30 PM IST). */
export function hourIST(now: Date = new Date()): number {
  const ist = nowIST(now)
  return ist.getUTCHours() + ist.getUTCMinutes() / 60
}

/** Start of today in IST, returned as the equivalent UTC instant. Useful for
 * Prisma queries like `created_at: { gte: startOfIstDay() }`. */
export function startOfIstDay(now: Date = new Date()): Date {
  const ist = nowIST(now)
  const istMidnight = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate(),
    0, 0, 0, 0,
  )
  return new Date(istMidnight - IST_OFFSET_MS)
}

/** Start of the IST week (Monday 00:00 IST) as a UTC instant. */
export function startOfIstWeek(now: Date = new Date()): Date {
  const today = startOfIstDay(now)
  const ist = nowIST(today)
  // Monday = 1, Sunday = 0 → treat Sunday as day 7
  const dow = ist.getUTCDay() === 0 ? 7 : ist.getUTCDay()
  return new Date(today.getTime() - (dow - 1) * 24 * 60 * 60 * 1000)
}

/** Start of the IST month as a UTC instant. */
export function startOfIstMonth(now: Date = new Date()): Date {
  const ist = nowIST(now)
  const istMonthStart = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1, 0, 0, 0, 0)
  return new Date(istMonthStart - IST_OFFSET_MS)
}
