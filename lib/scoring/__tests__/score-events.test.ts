import { describe, it, expect } from "vitest"
import { diffEnrichment, gradeChangeSummary } from "../score-events"

describe("diffEnrichment", () => {
  it("reports newly-added fields", () => {
    const d = diffEnrichment(
      { company_name: null, email: null, designation: "CEO" },
      { company_name: "Acme", email: "a@x.com", designation: "CEO" },
    )
    expect(d.fieldsAdded).toEqual(["Company", "Email"])
    expect(d.fieldsChanged).toEqual([])
    expect(d.summary).toBe("Company, Email added")
  })

  it("reports changed fields separately from added", () => {
    const d = diffEnrichment(
      { company_name: "Acme", designation: null },
      { company_name: "Acme Corp", designation: "CTO" },
    )
    expect(d.fieldsAdded).toEqual(["Role"])
    expect(d.fieldsChanged).toEqual(["Company"])
    expect(d.summary).toBe("Role added · Company updated")
  })

  it("treats expected_value 0 / empty string as not-filled", () => {
    const d = diffEnrichment({ expected_value: 0 }, { expected_value: 50000 })
    expect(d.fieldsAdded).toEqual(["Budget"])
  })

  it("returns null summary when nothing tracked changed", () => {
    const d = diffEnrichment({ company_name: "Acme" }, { company_name: "Acme", first_name: "Z" })
    expect(d.summary).toBeNull()
  })
})

describe("gradeChangeSummary", () => {
  it("formats a transition", () => {
    expect(gradeChangeSummary("C", "B")).toBe("Grade C → B")
  })
})
