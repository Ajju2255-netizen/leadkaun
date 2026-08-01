// ─────────────────────────────────────────────
// INTAKE ENGINE — analyse
//
// Pure, deterministic, dependency-light. Writes NOTHING. Runs on a SAMPLE (the
// caller passes the first ~2k rows) so a 100k-row file profiles in well under a
// second. No LLM here: ~80% of "understanding a dataset" is deterministic
// (formats, completeness, duplicates, B2B-vs-B2C, industry keywords). AI is
// reserved for genuine column ambiguity later — and is NOT part of this engine.
//
// Reuses the SAME primitives the real import uses — the canonical phone
// normaliser and the same industry inference — so what the report claims is
// exactly what the importer will do (Law 45: one lead, one truth).
// ─────────────────────────────────────────────

import { normalisePhone } from "../import/phone-normalise"
import { inferIndustry } from "../import/enrich-lead"
import { WHAT_HAPPENS_NEXT, CLOSING_LINE } from "./copy"
import type { EvidenceFinding, ContactQuality, IntakeConfidence, IntakeReport } from "./types"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The internal fields the column-mapper recognises (lib/import/column-map.ts).
const KNOWN_FIELDS = new Set([
  "first_name", "last_name", "phone", "email", "company_name", "designation",
  "city", "state", "pincode", "inquiry_text", "expected_value",
  "interest_level", "last_contact_days",
])

// Unmapped column keys (snake_cased) that signal a B2B dataset.
const B2B_HINT_KEYS = new Set([
  "gstin", "gst", "gst_no", "gst_number", "turnover", "annual_turnover", "revenue",
  "employees", "employee_count", "no_of_employees", "company_size", "industry", "website",
])

export type AnalyseInput = {
  /** A representative sample of parsed rows (keys already column-mapped). */
  sample: Record<string, string>[]
  /** Total rows in the whole file (the sample may be smaller). */
  totalRows: number
}

const r = Math.round
const pct = (count: number, total: number): number => (total > 0 ? (count / total) * 100 : 0)

export function analyseIntake(input: AnalyseInput): IntakeReport {
  const sample = input.sample ?? []
  const n = sample.length
  const totalRows = Math.max(input.totalRows ?? n, n)

  // Which columns appeared, and how many we recognised.
  const keys = new Set<string>()
  for (const row of sample) for (const k of Object.keys(row)) keys.add(k)
  const allKeys = Array.from(keys)
  const knownKeys = allKeys.filter((k) => KNOWN_FIELDS.has(k))
  const unmappedKeys = allKeys.filter((k) => !KNOWN_FIELDS.has(k))
  const b2bHintKeys = unmappedKeys.filter((k) => B2B_HINT_KEYS.has(k))

  const fill = (field: string): number =>
    pct(sample.filter((row) => (row[field] ?? "").trim() !== "").length, n)

  const phoneFill = fill("phone")
  const emailFill = fill("email")
  const companyFill = fill("company_name")
  const designationFill = fill("designation")
  const cityFill = fill("city")
  const budgetFill = fill("expected_value")

  // Reachability — using the SAME canonical normaliser the importer uses.
  const validPhones = sample.filter((row) => normalisePhone(row.phone ?? "") !== "").length
  const validPhonePct = pct(validPhones, n)
  const validEmails = sample.filter((row) => EMAIL_RE.test((row.email ?? "").trim().toLowerCase())).length
  const validEmailPct = pct(validEmails, n)

  // ── Country / currency (from phone shape) ──
  const indianPhones = sample.filter((row) => normalisePhone(row.phone ?? "").startsWith("+91")).length
  const indianPct = pct(indianPhones, n)
  const country: EvidenceFinding = indianPct >= 60
    ? { known: true, claim: "These look like India-based leads.", confidence: r(indianPct),
        evidence: [`${r(indianPct)}% of phone numbers are valid Indian numbers`] }
    : { known: false, claim: "We couldn't confidently determine the country yet.", confidence: r(indianPct),
        evidence: [validPhonePct < 50 ? "Most phone numbers couldn't be validated" : "Phone numbers don't fit a single country pattern"] }

  const currency: EvidenceFinding = country.known
    ? { known: true, claim: "Amounts are in Indian Rupees (₹).", confidence: country.confidence,
        evidence: ["Inferred from India-based phone numbers"] }
    : { known: false, claim: "We couldn't confidently determine the currency yet.", confidence: 0, evidence: [] }

  // ── Lead type: B2B vs B2C ──
  const b2bEvidence: string[] = []
  if (companyFill >= 40) b2bEvidence.push(`Company names present in ${r(companyFill)}% of rows`)
  if (designationFill >= 30) b2bEvidence.push(`Roles / designations present in ${r(designationFill)}% of rows`)
  for (const k of b2bHintKeys) b2bEvidence.push(`"${k}" column found`)

  let leadType: EvidenceFinding
  if (companyFill >= 40 || b2bHintKeys.length > 0) {
    leadType = {
      known: true, claim: "These look like B2B (business) leads.",
      confidence: Math.min(96, r(companyFill) + b2bHintKeys.length * 10),
      evidence: b2bEvidence.length ? b2bEvidence : [`Company data present in ${r(companyFill)}% of rows`],
    }
  } else if (companyFill < 15 && b2bHintKeys.length === 0) {
    leadType = {
      known: true, claim: "These look like B2C (consumer) leads.", confidence: r(100 - companyFill),
      evidence: ["No company data", `Name + phone${cityFill >= 40 ? " + city" : ""} only`],
    }
  } else {
    leadType = {
      known: false, claim: "We couldn't confidently tell if these are B2B or B2C yet.", confidence: 50,
      evidence: [`Company data present in only ${r(companyFill)}% of rows`],
    }
  }

  // ── Business type (industry) — only from company names, never guessed ──
  const companies = sample.map((row) => (row.company_name ?? "").trim()).filter(Boolean)
  const tally: Record<string, number> = {}
  for (const c of companies) {
    const ind = inferIndustry(c)
    if (ind) tally[ind] = (tally[ind] ?? 0) + 1
  }
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]
  let businessType: EvidenceFinding
  if (top && companies.length > 0 && pct(top[1], companies.length) >= 35) {
    const matchPct = pct(top[1], companies.length)
    businessType = {
      known: true, claim: `These look like ${top[0]} leads.`, confidence: r(matchPct),
      evidence: [`${r(matchPct)}% of company names match ${top[0]} patterns`, `${companies.length} company names analysed`],
    }
  } else {
    businessType = {
      known: false, claim: "We couldn't confidently determine the industry yet.", confidence: top ? r(pct(top[1], companies.length)) : 0,
      evidence: [companyFill < 15 ? "No company names in this file" : "Company names span several industries"],
    }
  }

  // ── Contact quality ──
  const reach = Math.max(validPhonePct, validEmailPct)
  const primary: ContactQuality["primary"] =
    validPhonePct >= validEmailPct && validPhonePct > 0 ? "phone" : validEmailPct > 0 ? "email" : "none"
  const contactQuality: ContactQuality = {
    stars: reach >= 95 ? 5 : reach >= 80 ? 4 : reach >= 60 ? 3 : reach >= 40 ? 2 : 1,
    validPhonePct: r(validPhonePct), validEmailPct: r(validEmailPct), primary,
    note: primary === "phone" ? `${r(validPhonePct)}% have a valid phone number`
        : primary === "email" ? `${r(validEmailPct)}% have a valid email`
        : "Few contacts could be validated",
  }

  // ── Missing high-value fields ──
  const missingFields: string[] = []
  if (budgetFill < 40) missingFields.push("Budget")
  if (companyFill < 40) missingFields.push("Company")
  if (designationFill < 40) missingFields.push("Designation / role")
  if (!businessType.known) missingFields.push("Industry")
  if (emailFill < 40) missingFields.push("Email")
  const hasSize = unmappedKeys.some((k) => ["company_size", "employees", "employee_count", "no_of_employees"].includes(k))
  if (!hasSize && leadType.known && leadType.claim.includes("B2B")) missingFields.push("Company size")

  // ── Duplicate estimate (in-file, by canonical phone) ──
  const phoneCounts: Record<string, number> = {}
  for (const row of sample) {
    const p = normalisePhone(row.phone ?? "")
    if (p) phoneCounts[p] = (phoneCounts[p] ?? 0) + 1
  }
  const dupRows = Object.values(phoneCounts).reduce((s, c) => s + (c > 1 ? c - 1 : 0), 0)
  const dupPct = pct(dupRows, n)
  const duplicateEstimate = {
    estimatedRows: r((dupPct / 100) * totalRows),
    pct: r(dupPct),
    note: dupPct === 0 ? "No repeated phone numbers in the sample" : `About ${r(dupPct)}% of rows repeat a phone number`,
  }

  // ── Confidence (decomposed → derived) ──
  const mappingConfidence = allKeys.length ? r(pct(knownKeys.length, allKeys.length)) : 0
  const coreFills = [fill("first_name"), phoneFill, emailFill, companyFill, cityFill]
  const dataCompleteness = r(coreFills.reduce((a, b) => a + b, 0) / coreFills.length)
  const contactQ = r(Math.max(validPhonePct, validEmailPct * 0.8))
  const businessContext = Math.min(100, r(companyFill * 0.5 + designationFill * 0.2 + (businessType.known ? 30 : 0)))
  const importIntelligenceScore = r(
    mappingConfidence * 0.30 + dataCompleteness * 0.20 + contactQ * 0.30 + businessContext * 0.20,
  )
  const band: IntakeConfidence["band"] =
    importIntelligenceScore >= 80 ? "ready" : importIntelligenceScore >= 60 ? "review" : "low"
  const confidence: IntakeConfidence = {
    mappingConfidence, dataCompleteness, contactQuality: contactQ, businessContext, importIntelligenceScore, band,
  }

  // ── Recommendation (plain English, honest) ──
  let recommendation: string
  if (band === "ready") {
    const addable = missingFields.slice(0, 2).map((m) => m.toLowerCase())
    recommendation = addable.length
      ? `These leads can be imported immediately. Adding ${addable.join(" and ")} later will sharpen prioritisation.`
      : "These leads can be imported immediately."
  } else if (band === "review") {
    recommendation = unmappedKeys.length
      ? "Worth a quick look — some columns weren't recognised and completeness is moderate. You can still import."
      : "Worth a quick look — data completeness is moderate. You can still import."
  } else {
    recommendation = "We're not fully confident yet. It's worth checking the highlighted issues before importing."
  }

  return {
    totalLeads: totalRows,
    sampled: n,
    leadType, country, currency,
    businessType, contactQuality, missingFields, duplicateEstimate,
    whatHappensNext: WHAT_HAPPENS_NEXT,
    confidence, recommendation,
    closingLine: CLOSING_LINE,
  }
}
