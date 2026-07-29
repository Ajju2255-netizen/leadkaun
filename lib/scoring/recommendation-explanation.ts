// ─────────────────────────────────────────────
// "WHY DID LEADKAUN RECOMMEND THIS?"  —  explanation layer
//
// Turns the recommendation into a set of structured, attributable reasons.
// HARD RULE (founder's): nothing hallucinated, nothing inferred beyond the
// engine. Every bullet here traces to a real score factor, the intent score,
// SQL status, or a data-confidence field — never a generated sentence like
// "this customer seems motivated". If the engine didn't compute it, it isn't
// shown. Pure & dependency-light so it can be unit-tested and reused.
//
// This is the STATIC baseline (grade + factors). The signal-aware NBA engine
// stays dark until we have adoption data to measure it against.
// ─────────────────────────────────────────────

import { buildScoreExplanation, type ScoreFactor, type ExplainInput } from "./explain"
import { computeConfidence, type ConfidenceInput, type ConfidenceBand } from "./confidence"

export type RecoEvidenceKind = "fit" | "intent" | "quality" | "status"

export type RecoEvidence = {
  /** A single, engine-attributable reason. Rendered with a ✓. */
  text: string
  kind: RecoEvidenceKind
}

export type RecommendationExplanation = {
  /** The action label being explained, e.g. "Call now". */
  recommendation: string
  /** The existing one-line action reason (already truthful). */
  actionReason: string
  /** Plain-English rationale naming the limiting dimension (from explain.ts). */
  rationale: string
  /** Positive, attributable reasons that support the recommendation. */
  evidence: RecoEvidence[]
  /** Honest limits — shown so the card never over-sells. */
  cautions: string[]
  confidenceBand: ConfidenceBand
  confidenceLabel: string
  /** Highest-impact missing fields (labels), for "Missing information". */
  missing: string[]
  /** "This recommendation would become stronger if …", or null when complete. */
  strongerIf: string | null
}

export type RecommendationExplainInput = ExplainInput &
  ConfidenceInput & {
    is_sql?: boolean | null
  }

const CONFIDENCE_LABEL: Record<ConfidenceBand, string> = {
  high: "High",
  moderate: "Moderate",
  low: "Low",
  very_low: "Very low",
}

function factorBullet(f: ScoreFactor): string {
  return f.note?.trim() ? `${f.label} — ${f.note}` : f.label
}

/**
 * Build the structured "why" for a lead's recommendation from data the engine
 * has already computed. Never fabricates; degrades gracefully on thin leads.
 */
export function buildRecommendationExplanation(
  lead: RecommendationExplainInput,
  action: { label: string; reason: string },
): RecommendationExplanation {
  const exp = buildScoreExplanation(lead)
  const conf = computeConfidence(lead)

  const evidence: RecoEvidence[] = []

  // Fit — only ICP factors that are genuinely strong ("good" tone, positive).
  for (const f of exp.fit.factors) {
    if (f.tone === "good" && f.points > 0) {
      evidence.push({ text: factorBullet(f), kind: "fit" })
    }
  }

  // Intent — signal-derived engagement, attributable to the intent score.
  if (exp.intent.score >= 60) {
    evidence.push({ text: `Strong buying intent (${exp.intent.score}/100)`, kind: "intent" })
  } else if (exp.intent.score >= 40) {
    evidence.push({ text: `Some recent engagement (intent ${exp.intent.score}/100)`, kind: "intent" })
  }

  // Status — SQL means fit AND intent both cleared the account thresholds.
  if (lead.is_sql) {
    evidence.push({ text: "Sales-qualified — fit and intent both cleared your thresholds", kind: "status" })
  }

  // Quality — reachability. One bullet max; only when actually present.
  const reach = exp.quality.factors.find(
    (f) => f.tone === "good" && f.points > 0 && (f.key === "phone" || f.key === "email"),
  )
  if (reach) {
    evidence.push({ text: `${reach.label} on file — reachable now`, kind: "quality" })
  }

  // Honest limits — never let the card over-sell.
  const cautions: string[] = []
  if (conf.needsEnrichment) {
    cautions.push(`Data confidence is ${CONFIDENCE_LABEL[conf.band].toLowerCase()} — this is recommended on limited information.`)
  }
  if (evidence.length === 0) {
    cautions.push("No strong positive signals yet — this is a low-priority recommendation.")
  }

  const missing = conf.missing.slice(0, 3).map((m) => m.label)
  const strongerIf =
    conf.missing.length > 0
      ? `This recommendation would become stronger if you confirm ${conf.missing[0].label.toLowerCase()}.`
      : null

  return {
    recommendation: action.label,
    actionReason: action.reason,
    rationale: exp.summary,
    evidence,
    cautions,
    confidenceBand: conf.band,
    confidenceLabel: CONFIDENCE_LABEL[conf.band],
    missing,
    strongerIf,
  }
}
