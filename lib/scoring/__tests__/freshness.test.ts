import { describe, it, expect } from "vitest"
import { computeFreshness, sourceAgeToDate, SOURCE_AGE_OPTIONS } from "../freshness"

const NOW = new Date("2026-06-28T00:00:00Z")
function daysAgo(n: number) { return new Date(NOW.getTime() - n * 86_400_000) }

describe("computeFreshness", () => {
  it("uses source-collection date over import date when present (catches old data imported today)", () => {
    const f = computeFreshness({
      source_collected_at: daysAgo(400), // collected over a year ago
      imported_at: NOW,                  // but imported today
      now: NOW,
    })
    expect(f.fromSource).toBe(true)
    expect(f.band).toBe("cold")
    expect(f.ageDays).toBe(400)
  })

  it("falls back to import date when no source date (fresh import reads Fresh)", () => {
    const f = computeFreshness({ source_collected_at: null, imported_at: daysAgo(2), now: NOW })
    expect(f.fromSource).toBe(false)
    expect(f.band).toBe("fresh")
  })

  it("bands by age boundaries", () => {
    const band = (d: number) => computeFreshness({ imported_at: daysAgo(d), now: NOW }).band
    expect(band(10)).toBe("fresh")    // < 30
    expect(band(60)).toBe("recent")   // < 90
    expect(band(120)).toBe("aging")   // < 180
    expect(band(300)).toBe("stale")   // < 365
    expect(band(400)).toBe("cold")    // >= 365
  })

  it("never reports a negative age", () => {
    const f = computeFreshness({ imported_at: new Date(NOW.getTime() + 86_400_000), now: NOW })
    expect(f.ageDays).toBe(0)
  })
})

describe("sourceAgeToDate", () => {
  it("maps known bands to a backdated date and 'unknown' to null", () => {
    expect(sourceAgeToDate("unknown", NOW)).toBeNull()
    const d = sourceAgeToDate("over_year", NOW)!
    expect(Math.round((NOW.getTime() - d.getTime()) / 86_400_000)).toBe(400)
  })

  it("every option except 'unknown' yields a date", () => {
    for (const o of SOURCE_AGE_OPTIONS) {
      const r = sourceAgeToDate(o.value, NOW)
      if (o.days == null) expect(r).toBeNull()
      else expect(r).toBeInstanceOf(Date)
    }
  })
})
