import type { LeadGrade } from "@prisma/client"
import { broadcastToUser } from "./broadcast"

/**
 * Detects score transitions after a recompute and pushes the matching realtime
 * toast to the lead's assigned rep (audit B3). Safe to call unconditionally —
 * it no-ops when there's no rep, no SQL crossing, and no grade drop, and it
 * never throws (broadcastToUser swallows errors).
 *
 * Payload shapes match the broadcast handlers in AlertListener.tsx.
 */

// Higher = better grade. A grade "drop" is new rank < old rank.
const GRADE_RANK: Record<LeadGrade, number> = { A: 6, B: 5, C: 4, D: 3, E: 2, F: 1 }

const MS_PER_DAY = 1000 * 60 * 60 * 24

export interface ScoreAlertInput {
  assignedRepId: string | null
  leadId: string
  leadName: string
  companyName: string | null
  /** Grade BEFORE the recompute. */
  previousGrade: LeadGrade
  /** Grade AFTER the recompute. */
  newGrade: LeadGrade
  /** is_sql BEFORE the recompute. */
  wasSql: boolean
  /** is_sql AFTER the recompute. */
  isSql: boolean
  expectedValue: number | null
  /** Last rep action before this event (for "days since contact"); falls back to imported_at. */
  lastActionAt: Date | null
  importedAt: Date
}

export async function dispatchScoreAlerts(input: ScoreAlertInput): Promise<void> {
  // No assigned rep → no one to toast.
  if (!input.assignedRepId) return

  const tasks: Promise<void>[] = []

  // SQL just crossed.
  if (input.isSql && !input.wasSql) {
    tasks.push(
      broadcastToUser(input.assignedRepId, "sql_crossed", {
        lead_id:      input.leadId,
        lead_name:    input.leadName,
        grade:        input.newGrade,
        company_name: input.companyName,
      }),
    )
  }

  // Grade dropped (e.g. A → C).
  if (GRADE_RANK[input.newGrade] < GRADE_RANK[input.previousGrade]) {
    const anchor = input.lastActionAt ?? input.importedAt
    const daysSinceContact = Math.max(0, Math.floor((Date.now() - anchor.getTime()) / MS_PER_DAY))
    tasks.push(
      broadcastToUser(input.assignedRepId, "grade_dropped", {
        lead_id:             input.leadId,
        lead_name:           input.leadName,
        from_grade:          input.previousGrade,
        to_grade:            input.newGrade,
        days_since_contact:  daysSinceContact,
        expected_value:      input.expectedValue ?? 0,
      }),
    )
  }

  if (tasks.length) await Promise.all(tasks)
}
