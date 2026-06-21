import { prisma } from "@/lib/prisma"
import { apiError } from "@/lib/api/response"

/**
 * DB-backed fixed-window rate limiter.
 *
 * One row per limiter key in `rate_limits`. The atomic INSERT … ON CONFLICT
 * increments the counter, resetting it when the window has elapsed — so it
 * works correctly across serverless instances (the DB is the shared store),
 * unlike per-instance in-memory counters.
 */

export type LimitPreset = { limit: number; windowSec: number }

/** Per-category limits. Keys are scoped by user or account at the call site. */
export const LIMITS = {
  importInit:  { limit: 20,   windowSec: 3600 }, // 20 new imports / hour / account
  importBatch: { limit: 1200, windowSec: 60 },   // generous: ~12k rows/min/user at 10/batch
  importOneShot:{ limit: 10,  windowSec: 3600 }, // 10 one-shot CSV imports / hour / account
  heavyWrite:  { limit: 60,   windowSec: 60 },   // lead create, signal logging
  write:       { limit: 120,  windowSec: 60 },   // general per-lead actions
  workspace:   { limit: 30,   windowSec: 60 },   // workspace / membership mutations
} satisfies Record<string, LimitPreset>

export async function checkRateLimit(key: string, { limit, windowSec }: LimitPreset) {
  const now = new Date()
  const windowStart = new Date(now.getTime() - windowSec * 1000)
  const rows = await prisma.$queryRaw<{ count: number; window_start: Date }[]>`
    INSERT INTO rate_limits ("key", "count", "window_start")
    VALUES (${key}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count"        = CASE WHEN rate_limits."window_start" < ${windowStart} THEN 1 ELSE rate_limits."count" + 1 END,
      "window_start" = CASE WHEN rate_limits."window_start" < ${windowStart} THEN ${now} ELSE rate_limits."window_start" END
    RETURNING "count", "window_start"
  `
  const count = Number(rows[0].count)
  const resetAt = new Date(rows[0].window_start.getTime() + windowSec * 1000)
  const retryAfter = Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000))
  return { allowed: count <= limit, count, limit, retryAfter }
}

/**
 * Enforce a rate limit. Returns a 429 NextResponse (with Retry-After) when the
 * key is over its limit, or null when the request may proceed:
 *
 *   const limited = await rateLimited(`leads:create:${session.user.id}`, LIMITS.heavyWrite)
 *   if (limited) return limited
 *
 * Fails OPEN — if the limiter query itself errors, the request is allowed
 * (availability over strictness for a non-critical guard).
 */
export async function rateLimited(
  key: string,
  preset: LimitPreset,
  message = "Too many requests. Please slow down and try again in a moment.",
) {
  try {
    const r = await checkRateLimit(key, preset)
    if (r.allowed) return null
    const res = apiError(message, "RATE_LIMITED", 429)
    res.headers.set("Retry-After", String(r.retryAfter))
    return res
  } catch (err) {
    console.error("Rate limiter error (failing open):", err)
    return null
  }
}
