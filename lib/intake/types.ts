// ─────────────────────────────────────────────
// INTAKE ENGINE — types
//
// The Intake Engine is a first-class service: the ONE intelligence gateway
// every lead enters through, no matter the connector (CSV, Google Sheets,
// Excel, HubSpot, Zoho, IndiaMART, API, WhatsApp export…). It profiles a
// dataset BEFORE a single lead is imported and produces the Import Intelligence
// Report — Leadkaun's first conversation with a customer.
//
// HARD RULE (Law 45 · Law 1 · evidence-outranks-inference): the report never
// states an uncertain thing as fact. Every claim is an EvidenceFinding — either
// a confident assertion WITH its evidence, or an honest "we couldn't determine
// this yet". Unknown ≠ wrong.
// ─────────────────────────────────────────────

/** A single claim the engine makes, phrased honestly and backed by evidence. */
export type EvidenceFinding = {
  /** The assertion. When `known` is false, this states the uncertainty plainly. */
  claim: string
  /** 0–100. How sure the engine is. */
  confidence: number
  /** Concrete, attributable observations. Non-empty whenever `known` is true. */
  evidence: string[]
  /** false → the engine could NOT determine this (surface it as unknown, not bad). */
  known: boolean
}

export type ContactQuality = {
  validPhonePct: number
  validEmailPct: number
  primary: "phone" | "email" | "none"
  note: string
}

/** External readiness — calm B2B language, never stars, never red. */
export type Readiness = { label: "High" | "Medium" | "Low"; message: string }

/** Per-area readiness, in words (no stars): Excellent / Good / Needs review. */
export type DataReadiness = { area: string; rating: "Excellent" | "Good" | "Needs review"; note: string }

/**
 * The confidence is DECOMPOSED (four components) — far more useful for
 * debugging a bad import than one opaque number — then a single internal-facing
 * Import Intelligence Score is derived. `band` gates the experience:
 *   ready → import immediately · review → suggest a look · low → ask before importing.
 */
export type IntakeConfidence = {
  mappingConfidence: number   // how many columns we recognised
  dataCompleteness: number    // how filled the core fields are
  contactQuality: number      // how reachable the leads are
  businessContext: number     // how much company/industry/role signal exists
  /** Derived, INTERNAL — never shown as a number to the customer. */
  importIntelligenceScore: number
  band: "ready" | "review" | "low"
}

export type IntakeReport = {
  // ── Overview ──
  totalLeads: number
  sampled: number
  leadType: EvidenceFinding   // B2B vs B2C
  country: EvidenceFinding
  currency: EvidenceFinding
  // ── What we found ──
  businessType: EvidenceFinding
  contactQuality: ContactQuality
  dataReadiness: DataReadiness[]
  missingFields: string[]
  duplicateEstimate: { estimatedRows: number; pct: number; note: string }
  /** "Things we noticed" — honest, evidence-backed observations for the report. */
  noticed: string[]
  // ── What Leadkaun will do next (expectation-setting) ──
  whatHappensNext: string[]
  // ── Judgement ──
  /** External-facing readiness (High/Medium/Low + calm message). */
  readiness: Readiness
  /** Internal confidence decomposition + derived score. Not shown as numbers. */
  confidence: IntakeConfidence
  recommendation: string
  /** The one iconic closing sentence. Always present. */
  closingLine: string
  /** Transparency panel content ("How did we determine this?"). */
  howWeDetermined: string[]
}
