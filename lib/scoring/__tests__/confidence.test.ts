import { describe, it, expect } from "vitest"
import { computeConfidence } from "../confidence"

describe("computeConfidence", () => {
  it("rates a thin lead (name + phone + email) as low confidence / needs enrichment", () => {
    const c = computeConfidence({ first_name: "Asha", phone: "+919876543210", email: "a@x.com" })
    expect(c.score).toBe(30) // 8 (name) + 12 (phone) + 10 (email)
    expect(c.band).toBe("low")
    expect(c.needsEnrichment).toBe(true)
    expect(c.reason).toMatch(/add company/i)
  })

  it("rates a fully-populated lead as high confidence, not needing enrichment", () => {
    const c = computeConfidence({
      first_name: "Asha", phone: "+919876543210", email: "a@x.com",
      company_name: "Acme", designation: "CEO", state: "Karnataka",
      inquiry_text: "Need 50 units", expected_value: 200000,
    })
    expect(c.score).toBe(100)
    expect(c.band).toBe("high")
    expect(c.needsEnrichment).toBe(false)
    expect(c.missing).toHaveLength(0)
  })

  it("orders the missing checklist by highest accuracy impact first", () => {
    const c = computeConfidence({ first_name: "Asha", phone: "+919876543210" })
    // company (22) is the single biggest gap, then designation (18)
    expect(c.missing[0].key).toBe("company")
    expect(c.missing[1].key).toBe("designation")
    expect(c.missing.every((m) => m.key !== "name" && m.key !== "phone")).toBe(true)
  })

  it("treats city as satisfying the location field", () => {
    const withCity = computeConfidence({ first_name: "A", phone: "1", city: "Pune" })
    const withState = computeConfidence({ first_name: "A", phone: "1", state: "MH" })
    expect(withCity.score).toBe(withState.score)
    expect(withCity.missing.some((m) => m.key === "location")).toBe(false)
  })

  it("ignores a zero/negative expected_value as 'not provided'", () => {
    const zero = computeConfidence({ first_name: "A", phone: "1", expected_value: 0 })
    expect(zero.missing.some((m) => m.key === "budget")).toBe(true)
  })
})
