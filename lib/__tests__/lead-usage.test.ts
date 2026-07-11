import { describe, it, expect, vi, beforeEach } from "vitest"
import { getLeadUsage, leadsRemaining } from "@/lib/billing/lead-usage"

const prismaMock = vi.hoisted(() => ({
  lead: { count: vi.fn() },
  subscription: { findUnique: vi.fn() },
  plan: { findUniqueOrThrow: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const subWith = (status: string, name: string, limit: number | null) => ({
  status,
  plan: { name, monthly_lead_limit: limit },
})

beforeEach(() => {
  vi.clearAllMocks()
  // Free fallback plan for the no-subscription / canceled paths.
  prismaMock.plan.findUniqueOrThrow.mockResolvedValue({ name: "Free", monthly_lead_limit: 100 })
})

describe("getLeadUsage", () => {
  it("reports usage against the plan's monthly limit", async () => {
    prismaMock.lead.count.mockResolvedValue(4823)
    prismaMock.subscription.findUnique.mockResolvedValue(subWith("active", "Growth", 25000))

    const u = await getLeadUsage("a")
    expect(u).toEqual({ used: 4823, limit: 25000, remaining: 20177, isOver: false, planName: "Growth" })
  })

  it("marks over at exactly the limit, not one past it", async () => {
    prismaMock.lead.count.mockResolvedValue(5000)
    prismaMock.subscription.findUnique.mockResolvedValue(subWith("active", "Starter", 5000))

    const u = await getLeadUsage("a")
    expect(u.isOver).toBe(true)
    expect(u.remaining).toBe(0)
  })

  it("never reports negative remaining when already over", async () => {
    prismaMock.lead.count.mockResolvedValue(5200)
    prismaMock.subscription.findUnique.mockResolvedValue(subWith("active", "Starter", 5000))
    expect((await getLeadUsage("a")).remaining).toBe(0)
  })

  it("treats a null limit as unlimited (Scale/Enterprise)", async () => {
    prismaMock.lead.count.mockResolvedValue(999999)
    prismaMock.subscription.findUnique.mockResolvedValue(subWith("active", "Scale", null))

    const u = await getLeadUsage("a")
    expect(u.limit).toBeNull()
    expect(u.remaining).toBeNull()
    expect(u.isOver).toBe(false)
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
