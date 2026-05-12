import { describe, it, expect } from "vitest"
import {
  channelFromSignal,
  activityHintFor,
  activeMinutesSince,
} from "../channel-hint"

describe("channelFromSignal", () => {
  it("WA_* → whatsapp", () => {
    expect(channelFromSignal("WA_REPLIED_1H")).toBe("whatsapp")
    expect(channelFromSignal("WA_TAG_ASKED_PRICING")).toBe("whatsapp")
    expect(channelFromSignal("WA_NO_REPLY")).toBe("whatsapp")
  })

  it("CALL_* → phone", () => {
    expect(channelFromSignal("CALL_ANSWERED_INTERESTED")).toBe("phone")
    expect(channelFromSignal("CALL_NOT_ANSWERED")).toBe("phone")
  })

  it("EMAIL_* → email", () => {
    expect(channelFromSignal("EMAIL_OPENED")).toBe("email")
    expect(channelFromSignal("EMAIL_CLICKED")).toBe("email")
  })

  it("null / undefined / unknown → website", () => {
    expect(channelFromSignal(null)).toBe("website")
    expect(channelFromSignal(undefined)).toBe("website")
    expect(channelFromSignal("IMPORT_HIGH_INTENT")).toBe("website")
    expect(channelFromSignal("INTENT_DECAY")).toBe("website")
  })
})

describe("activityHintFor", () => {
  it("prioritises latest signal over note theme", () => {
    expect(activityHintFor({
      last_signal_type: "WA_TAG_ASKED_PRICING",
      inquiry_text: "wants a demo",
    })).toBe("Asked about pricing")
  })

  it("falls back to note theme when signal is unknown", () => {
    expect(activityHintFor({
      last_signal_type: "UNKNOWN_SIGNAL",
      inquiry_text: "looking for pricing details",
    })).toBe("Asked about pricing")
  })

  it("falls back to stage when both signal and notes empty", () => {
    expect(activityHintFor({ stage_name: "Qualified" })).toBe("Qualified")
  })

  it("generic fallback when nothing available", () => {
    expect(activityHintFor({})).toBe("New lead")
  })

  it("known signal labels render correctly", () => {
    expect(activityHintFor({ last_signal_type: "CALL_ANSWERED_INTERESTED" }))
      .toBe("Said they're interested")
    expect(activityHintFor({ last_signal_type: "WA_REPLIED_1H" }))
      .toBe("Replied on WhatsApp")
    expect(activityHintFor({ last_signal_type: "EMAIL_OPENED" }))
      .toBe("Opened email")
  })
})

describe("activeMinutesSince", () => {
  it("returns elapsed minutes from a recent timestamp", () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60_000)
    const mins = activeMinutesSince(tenMinAgo)
    expect(mins).toBeGreaterThanOrEqual(10)
    expect(mins).toBeLessThan(12)
  })

  it("prefers last_action_at over imported_at", () => {
    const oneHourAgo  = new Date(Date.now() - 60 * 60_000)
    const oneDayAgo   = new Date(Date.now() - 24 * 60 * 60_000)
    expect(activeMinutesSince(oneHourAgo, oneDayAgo)).toBeLessThan(70)
  })

  it("falls back to imported_at when no action yet", () => {
    const twentyMinAgo = new Date(Date.now() - 20 * 60_000)
    expect(activeMinutesSince(null, twentyMinAgo)).toBeGreaterThanOrEqual(20)
  })

  it("returns null when both timestamps missing", () => {
    expect(activeMinutesSince(null, null)).toBeNull()
    expect(activeMinutesSince(undefined, undefined)).toBeNull()
  })

  it("accepts ISO strings", () => {
    const iso = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(activeMinutesSince(iso)).toBeGreaterThanOrEqual(5)
  })
})
