// Score Evolution timeline — append one snapshot row per meaningful change to a
// lead's grade/confidence. Recording is ALWAYS best-effort: a timeline failure
// must never break scoring, signal logging, import, or edits.

import type { Prisma, PrismaClient, ScoreEventKind, LeadGrade } from "@prisma/client"
import { computeConfidence } from "./confidence"

type TxClient = Prisma.TransactionClient | PrismaClient

/** Lead shape needed to snapshot a timeline event (scores + completeness fields). */
export type ScoreEventLead = {
  id: string
  account_id: string
  workspace_id: string | null
  grade: LeadGrade
  fit_score: number
  intent_score: number
  quality_score: number
  // completeness fields → confidence snapshot
  first_name?: string | null
  phone?: string | null
  email?: string | null
  company_name?: string | null
  designation?: string | null
  city?: string | null
  state?: string | null
  expected_value?: number | null
  inquiry_text?: string | null
}

export type RecordEventInput = {
  lead: ScoreEventLead
  kind: ScoreEventKind
  summary: string
  detail?: Record<string, unknown> | null
  occurredAt?: Date
}

/**
 * Append a Score Evolution event. Best-effort — never throws into the caller.
 */
export async function recordScoreEvent(tx: TxClient, input: RecordEventInput): Promise<void> {
  try {
    const conf = computeConfidence(input.lead)
    await tx.leadScoreEvent.create({
      data: {
        account_id:    input.lead.account_id,
        workspace_id:  input.lead.workspace_id ?? null,
        lead_id:       input.lead.id,
        kind:          input.kind,
        ...(input.occurredAt ? { occurred_at: input.occurredAt } : {}),
        grade:         input.lead.grade,
        confidence:    conf.score,
        fit_score:     input.lead.fit_score,
        intent_score:  input.lead.intent_score,
        quality_score: input.lead.quality_score,
        summary:       input.summary,
        detail:        (input.detail ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })
  } catch (e) {
    console.warn("[score-event] failed to record:", String(e))
  }
}

// ── Enrichment diff → human summary ──────────────────────────────────────────

const TRACKED_FIELDS: { key: string; label: string }[] = [
  { key: "company_name",   label: "Company" },
  { key: "email",          label: "Email" },
  { key: "designation",    label: "Role" },
  { key: "city",           label: "City" },
  { key: "state",          label: "State" },
  { key: "pincode",        label: "Pincode" },
  { key: "expected_value", label: "Budget" },
  { key: "inquiry_text",   label: "Inquiry" },
]

function filled(v: unknown): boolean {
  return v != null && String(v).trim() !== "" && !(typeof v === "number" && v === 0)
}

export type EnrichmentDiff = {
  fieldsAdded: string[]
  fieldsChanged: string[]
  summary: string | null
}

/** Diff a lead's tracked fields before/after an edit into a timeline summary. */
export function diffEnrichment(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): EnrichmentDiff {
  const fieldsAdded: string[] = []
  const fieldsChanged: string[] = []
  for (const f of TRACKED_FIELDS) {
    const had = filled(before[f.key])
    const has = filled(after[f.key])
    if (!had && has) fieldsAdded.push(f.label)
    else if (had && has && String(before[f.key]) !== String(after[f.key])) fieldsChanged.push(f.label)
  }
  if (fieldsAdded.length === 0 && fieldsChanged.length === 0) {
    return { fieldsAdded, fieldsChanged, summary: null }
  }
  const parts: string[] = []
  if (fieldsAdded.length) parts.push(`${fieldsAdded.join(", ")} added`)
  if (fieldsChanged.length) parts.push(`${fieldsChanged.join(", ")} updated`)
  return { fieldsAdded, fieldsChanged, summary: parts.join(" · ") }
}

/** "Grade C → B" style summary. */
export function gradeChangeSummary(from: LeadGrade, to: LeadGrade): string {
  return `Grade ${from} → ${to}`
}
