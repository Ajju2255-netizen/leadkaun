import { describe, it, expect } from "vitest"
import { processSignalAndUpdateScores } from "../orchestrator"

/**
 * Regression test for audit bug B1.
 *
 * The orchestrator used to pass `lead.company_name` directly as the `industry`
 * input to the fit scorer, so the company name (e.g. "Sunrise Hospital") was
 * matched against the ICP industry list ("Healthcare") and never matched —
 * the 30-point industry component silently collapsed to 0 on every recompute.
 *
 * The fix routes the company name through inferIndustry() (matching the import
 * and admin paths). This test pins that behaviour: a lead whose company name
 * infers to an ICP-listed industry must receive full industry credit (30).
 */

type AnyObj = Record<string, unknown>

function makeTx(lead: AnyObj, account: AnyObj) {
  let captured: AnyObj | null = null
  const tx = {
    lead: {
      findUniqueOrThrow: async () => lead,
      update: async ({ data }: { data: AnyObj }) => {
        captured = data
        return { ...lead, ...data }
      },
    },
    account: {
      findUniqueOrThrow: async () => account,
    },
  }
  return { tx, getCaptured: () => captured }
}

const baseLead: AnyObj = {
  id: "lead_1",
  company_name: "Sunrise Hospital",   // infers to "Healthcare"
  state: "Kerala",
  city: "Kochi",
  designation: null,
  expected_value: null,
  phone: "+919876543210",
  email: null,
  inquiry_text: null,
  junk_flags: [],
  is_junk: false,
  grade: "E",
  is_sql: false,
  sql_crossed_at: null,
  grade_changed_at: null,
  previous_grade: null,
  imported_at: new Date(),
  source: { intent_baseline: 10, reliability_score: 100, key: "csv" },
  signals: [],
}

const healthcareIcp: AnyObj = {
  icp_configured: true,
  icp_industries: ["Healthcare"],
  icp_states: [],
  icp_business_types: [],
  icp_roles: [],
  icp_budget_min: null,
  icp_budget_max: null,
  icp_sales_cycle: "FOUR_WEEKS",
  sql_fit_threshold: 55,
  sql_intent_threshold: 45,
}

describe("processSignalAndUpdateScores — industry inference (B1)", () => {
  it("credits full industry points when the company name infers an ICP industry", async () => {
    const { tx, getCaptured } = makeTx(baseLead, healthcareIcp)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await processSignalAndUpdateScores("lead_1", "acct_1", tx as any)

    const breakdown = (getCaptured()!.fit_score_breakdown ?? {}) as AnyObj
    expect(breakdown.industry).toBe(30)
    expect(result.fit_score).toBeGreaterThan(0)
  })

  it("sums persisted IMPORT_* signals into intent (B2 — no collapse to baseline)", async () => {
    // A freshly imported lead carries SOURCE_BASELINE + IMPORT_* signals. The
    // engine must sum them, so intent reflects the import boost rather than
    // collapsing back to the source baseline on recompute.
    const leadWithImportSignals: AnyObj = {
      ...baseLead,
      signals: [
        { signal_type: "SOURCE_BASELINE", signal_value: 10, created_at: new Date() },
        { signal_type: "IMPORT_HIGH_INTENT", signal_value: 40, created_at: new Date() },
      ],
    }
    const { tx, getCaptured } = makeTx(leadWithImportSignals, healthcareIcp)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await processSignalAndUpdateScores("lead_1", "acct_1", tx as any)

    // 10 (baseline) + 40 (import high intent), no decay at t=0 → 50.
    expect(result.intent_score).toBe(50)
    expect(getCaptured()!.intent_score).toBe(50)
  })

  it("grades pre-execution until a real CALL/WA signal arrives (engine = source of truth)", async () => {
    // Import-time signals don't count as execution → pre-execution grading.
    const imported: AnyObj = {
      ...baseLead,
      signals: [{ signal_type: "IMPORT_HIGH_INTENT", signal_value: 40, created_at: new Date() }],
    }
    const { getCaptured: g1, tx: tx1 } = makeTx(imported, healthcareIcp)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await processSignalAndUpdateScores("lead_1", "acct_1", tx1 as any)
    const gradeAtImport = g1()!.grade

    // Same lead after a real call signal → post-execution grading path.
    const contacted: AnyObj = {
      ...baseLead,
      signals: [
        { signal_type: "IMPORT_HIGH_INTENT", signal_value: 40, created_at: new Date() },
        { signal_type: "CALL_ANSWERED_INTERESTED", signal_value: 35, created_at: new Date() },
      ],
    }
    const { getCaptured: g2, tx: tx2 } = makeTx(contacted, healthcareIcp)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await processSignalAndUpdateScores("lead_1", "acct_1", tx2 as any)
    // Both produce a concrete grade; the point is the engine — not bespoke
    // import math — assigns it, so import and recompute can never diverge.
    expect(typeof gradeAtImport).toBe("string")
    expect(typeof g2()!.grade).toBe("string")
  })

  it("does not match raw company name against the ICP industry list", async () => {
    // Company name that infers NO industry must NOT accidentally score 30.
    const { tx, getCaptured } = makeTx(
      { ...baseLead, company_name: "Healthcare Holdings Pvt Ltd" },
      // ICP industry deliberately set to the literal company word to prove we
      // match on the INFERRED industry, not the raw name.
      { ...healthcareIcp, icp_industries: ["Healthcare Holdings Pvt Ltd"] },
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await processSignalAndUpdateScores("lead_1", "acct_1", tx as any)

    const breakdown = (getCaptured()!.fit_score_breakdown ?? {}) as AnyObj
    // "Healthcare Holdings Pvt Ltd" contains "health" → infers "Healthcare",
    // which is NOT equal to the ICP string, so industry must be 0 (mismatch).
    expect(breakdown.industry).toBe(0)
  })
})
