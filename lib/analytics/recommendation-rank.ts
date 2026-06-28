// ─────────────────────────────────────────────
// RECOMMENDATION ADOPTION — rank capture
//
// North Star: are reps working the leads we recommend? We record, at the
// moment a rep FIRST contacts a lead, that lead's 1-based rank in their
// priority queue. rank <= TOP_N means they worked a recommended lead
// ("accepted"); rank > TOP_N means they skipped the recommendations to work a
// lower-priority lead ("ignored"). Adoption % = accepted / (accepted + ignored).
//
// The ranking mirrors the /queue surface: ai_score desc, then expected_value
// desc, then newer-first.
// ─────────────────────────────────────────────

import type { Prisma, PrismaClient } from "@prisma/client"
import { computeAiScore } from "@/lib/scoring/ai-score"

/** A lead is "recommended" when it sits in the rep's top-N priority queue. */
export const RECOMMENDATION_TOP_N = 10

type TxClient = Prisma.TransactionClient | PrismaClient

export type RankCandidate = {
  id: string
  fit_score: number
  intent_score: number
  quality_score: number
  expected_value: number | null
  imported_at: Date
}

function priorityCompare(a: RankCandidate, b: RankCandidate): number {
  const sa = computeAiScore({ fit: a.fit_score, intent: a.intent_score, quality: a.quality_score })
  const sb = computeAiScore({ fit: b.fit_score, intent: b.intent_score, quality: b.quality_score })
  if (sb !== sa) return sb - sa
  const va = a.expected_value ?? 0
  const vb = b.expected_value ?? 0
  if (vb !== va) return vb - va
  return b.imported_at.getTime() - a.imported_at.getTime()
}

/**
 * Pure: the 1-based rank of `targetId` within `candidates` under the queue's
 * priority order. Returns null if the target isn't in the set.
 */
export function rankInQueue(targetId: string, candidates: RankCandidate[]): number | null {
  const sorted = [...candidates].sort(priorityCompare)
  const idx = sorted.findIndex((c) => c.id === targetId)
  return idx >= 0 ? idx + 1 : null
}

/** Was a first-action rank an adoption of a recommendation? */
export function isAdopted(rank: number | null | undefined): boolean {
  return rank != null && rank <= RECOMMENDATION_TOP_N
}

export type RankableLead = RankCandidate & {
  account_id: string
  workspace_id: string | null
  assigned_rep_id: string | null
}

/**
 * Compute a lead's rank within its ASSIGNED rep's current open priority queue.
 * Returns null when the lead has no assigned rep (no rep-queue to rank against).
 * Safe to call inside a transaction.
 */
export async function computeFirstActionRank(tx: TxClient, lead: RankableLead): Promise<number | null> {
  if (!lead.assigned_rep_id) return null

  const open = await tx.lead.findMany({
    where: {
      account_id:      lead.account_id,
      workspace_id:    lead.workspace_id,
      assigned_rep_id: lead.assigned_rep_id,
      is_junk:     false,
      is_fatigued: false,
      is_missed:   false,
      won_at:  null,
      lost_at: null,
    },
    select: {
      id: true, fit_score: true, intent_score: true, quality_score: true,
      expected_value: true, imported_at: true,
    },
  })

  // The lead being worked should already be in the open set; include it defensively.
  const candidates: RankCandidate[] = open.some((l) => l.id === lead.id)
    ? open
    : [...open, {
        id: lead.id, fit_score: lead.fit_score, intent_score: lead.intent_score,
        quality_score: lead.quality_score, expected_value: lead.expected_value, imported_at: lead.imported_at,
      }]

  return rankInQueue(lead.id, candidates)
}
