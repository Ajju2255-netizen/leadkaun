import { describe, it, expect, vi, beforeEach } from "vitest"
import { getLeadUsage, leadsRemaining, ACTIVE_LEAD } from "@/lib/billing/lead-usage"

const prismaMock = vi.hoisted(() => ({
  lead: { count: vi.fn() },
  subscription: { findUnique: vi.fn() },
  plan: { findUniqueOrThrow: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const subWith = (status: string, name: string, limit: number | null) => ({
  status,
  plan: { name, active_lead_limit: limit },
})

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.plan.findUniqueOrThrow.mockResolvedValue({ name: "Free", active_lead_limit: 100 })
})

describe("ACTIVE_LEAD filter", () => {
  it("counts only open leads — not won, lost, or junked", () => {
    expect(ACTIVE_LEAD).toEqual({ won_at: null, lost_at: null, is_junk: false })
  })

  it("is the filter passed to the count query", async () => {
    prismaMock.lead.count.mockResolvedValue(10)
    prismaMock.subscription.findUnique.mockResolvedValue(subWith("active", "Growth", 25000))
    await getLeadUsage("a")
    expect(prismaMock.lead.count).toHaveBeenCalledWith({
      where: { account_id: "a", won_at: null, lost_at: null, is_junk: false },
    })
  })
})

describe("getLeadUsage", () => {
  it("reports active-lead usage against the plan limit", async () => {
    prismaMock.lead.count.mockResolvedValue(80)
    prismaMock.subscription.findUnique.mockResolvedValue(subWith("active", "Free", 100))

    const u = await getLeadUsage("a")
    expect(u).toEqual({
      used: 80, limit: 100, remaining: 20, pct: 80, isOver: false, nearLimit: true, planName: "Free",
    })
  })

  it("flags nearLimit at exactly 80%, not before", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subWith("active", "Free", 100))
    prismaMock.lead.count.mockResolvedValue(79)
    expect((await getLeadUsage("a")).nearLimit).toBe(false)
    prismaMock.lead.count.mockResolvedValue(80)
    expect((await getLeadUsage("a")).nearLimit).toBe(true)
  })

  it("marks over at the cap and clamps remaining/pct", async () => {
    prismaMock.lead.count.mockResolvedValue(100)
    prismaMock.subscription.findUnique.mockResolvedValue(subWith("active", "Free", 100))
    const u = await getLeadUsage("a")
    expect(u.isOver).toBe(true)
    expect(u.remaining).toBe(0)
    expect(u.pct).toBe(100)

    prismaMock.lead.count.mockResolvedValue(140)
    const over = await getLeadUsage("a")
    expect(over.remaining).toBe(0)
    expect(over.pct).toBe(100)
  })

  it("treats a null limit as unlimited (Scale/Enterprise)", async () => {
    prismaMock.lead.count.mockResolvedValue(999999)
    prismaMock.subscription.findUnique.mockResolvedValue(subWith("active", "Scale", null))
    const u = await getLeadUsage("a")
    expect(u.limit).toBeNull()
    expect(u.remaining).toBeNull()
    expect(u.isOver).toBe(false)
    expect(u.nearLimit).toBe(false)
    expect(u.pct).toBe(0)
  })

  it("falls back to the Free limit with no subscription", async () => {
    prismaMock.lead.count.mockResolvedValue(60)
    prismaMock.subscription.findUnique.mockResolvedValue(null)
    const u = await getLeadUsage("a")
    expect(u.limit).toBe(100)
    expect(u.planName).toBe("Free")
    expect(u.remaining).toBe(40)
  })

  it("falls back to Free when the subscription is canceled", async () => {
    prismaMock.lead.count.mockResolvedValue(50)
    prismaMock.subscription.findUnique.mockResolvedValue(subWith("canceled", "Scale", null))
    expect((await getLeadUsage("a")).limit).toBe(100)
  })
})

describe("leadsRemaining", () => {
  it("returns Infinity when unlimited", async () => {
    prismaMock.lead.count.mockResolvedValue(10)
    prismaMock.subscription.findUnique.mockResolvedValue(subWith("active", "Scale", null))
    expect(await leadsRemaining("a")).toBe(Number.POSITIVE_INFINITY)
  })

  it("returns the exact remaining when capped", async () => {
    prismaMock.lead.count.mockResolvedValue(4990)
    prismaMock.subscription.findUnique.mockResolvedValue(subWith("active", "Starter", 5000))
    expect(await leadsRemaining("a")).toBe(10)
  })
})
