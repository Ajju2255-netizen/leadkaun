// ─────────────────────────────────────────────
// LEARNING ENGINE — pure aggregation helpers
//
// The account-level "Leadkaun is learning your business" insights. Every
// insight is gated by a minimum sample so a thin account honestly reads
// "still learning" instead of asserting a pattern from 3 data points.
//
// Pure & dependency-free (the route does the DB queries, these do the math) so
// the statistics are unit-testable.
// ─────────────────────────────────────────────

export const LEARNING_GATES = {
  calibrationDecided: 20, // decided (won+lost) leads for a trustworthy accuracy
  closeTimePerGrade:  3,  // won leads per grade bucket
  segmentDecided:     8,  // decided leads per segment
  bestTimeSignals:    20, // positive-response signals
  repCoachingReps:    2,  // reps with adoption data
} as const

const HIGH_GRADES = new Set(["A", "B"])
const LOW_GRADES  = new Set(["D", "E", "F"])

export type GradeOutcome = { grade: string; won: boolean }

export type Calibration = {
  perGrade: { grade: string; decided: number; winRate: number }[]
  abWinRate: number | null   // 0..1
  deWinRate: number | null   // 0..1
  lift: number | null        // abWinRate / deWinRate
  accuracy: number | null    // 0..100 — directional agreement (A/B expect win, D/E/F expect loss; C excluded)
  decided: number
}

export function calibration(rows: GradeOutcome[]): Calibration {
  const per: Record<string, { decided: number; won: number }> = {}
  for (const r of rows) {
    const g = (per[r.grade] ??= { decided: 0, won: 0 })
    g.decided++
    if (r.won) g.won++
  }
  const perGrade = Object.entries(per)
    .map(([grade, v]) => ({ grade, decided: v.decided, winRate: Math.round((v.won / v.decided) * 100) }))
    .sort((a, b) => a.grade.localeCompare(b.grade))

  const ab = rows.filter((r) => HIGH_GRADES.has(r.grade))
  const de = rows.filter((r) => LOW_GRADES.has(r.grade))
  const abWins = ab.filter((r) => r.won).length
  const deWins = de.filter((r) => r.won).length

  const abWinRate = ab.length ? abWins / ab.length : null
  const deWinRate = de.length ? deWins / de.length : null
  const lift = abWinRate != null && deWinRate != null && deWinRate > 0
    ? Math.round((abWinRate / deWinRate) * 10) / 10
    : null

  const denom = ab.length + de.length
  const agree = abWins + (de.length - deWins) // A/B that won + D/E/F that lost
  const accuracy = denom > 0 ? Math.round((agree / denom) * 100) : null

  return { perGrade, abWinRate, deWinRate, lift, accuracy, decided: rows.length }
}

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export type CloseTime = { grade: string; medianDays: number; n: number }

export function closeTimeByGrade(rows: { grade: string; days: number }[], minN = LEARNING_GATES.closeTimePerGrade): CloseTime[] {
  const map: Record<string, number[]> = {}
  for (const r of rows) (map[r.grade] ??= []).push(r.days)
  return Object.entries(map)
    .map(([grade, d]) => ({ grade, medianDays: Math.round(median(d) ?? 0), n: d.length }))
    .filter((x) => x.n >= minN)
    .sort((a, b) => a.grade.localeCompare(b.grade))
}

export type SegmentWin = { segment: string; won: number; decided: number; winRate: number }

export function winBySegment(rows: { segment: string; won: boolean }[], minDecided = LEARNING_GATES.segmentDecided): SegmentWin[] {
  const map: Record<string, { won: number; decided: number }> = {}
  for (const r of rows) {
    const s = (map[r.segment] ??= { won: 0, decided: 0 })
    s.decided++
    if (r.won) s.won++
  }
  return Object.entries(map)
    .map(([segment, v]) => ({ segment, won: v.won, decided: v.decided, winRate: Math.round((v.won / v.decided) * 100) }))
    .filter((x) => x.decided >= minDecided)
    .sort((a, b) => b.winRate - a.winRate)
}

export type BestHour = { hour: number; count: number; total: number }

/** Most common hour-of-day (0–23) among positive-response signal times. */
export function bestHour(hours: number[]): BestHour | null {
  if (hours.length === 0) return null
  const buckets: Record<number, number> = {}
  for (const h of hours) {
    const hr = ((Math.floor(h) % 24) + 24) % 24
    buckets[hr] = (buckets[hr] ?? 0) + 1
  }
  let hour = -1, count = 0
  for (const [hr, c] of Object.entries(buckets)) {
    if (c > count) { count = c; hour = Number(hr) }
  }
  return { hour, count, total: hours.length }
}
