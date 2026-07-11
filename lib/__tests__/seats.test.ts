import { describe, it, expect, vi, beforeEach } from "vitest"
import { OCCUPIES_SEAT, getSeatUsage, seatsExceedPlan } from "@/lib/billing/seats"

// vi.hoisted so the mock object exists before the hoisted vi.mock factory (and
// the static import above, which resolves to this mocked prisma) reference it.
const prismaMock = vi.hoisted(() => ({
  user: { count: vi.fn() },
  subscription: { findUnique: vi.fn() },
  plan: { findUniqueOrThrow: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const PLANS: Record<string, { key: string; name: string; max_seats: number }> = {
  trial:   { key: "trial",   name: "Trial",   max_seats: 30 },
  starter: { key: "starter", name: "Starter", max_seats: 10 },
  growth:  { key: "growth",  name: "Growth",  max_seats: 30 },
  scale:   { key: "scale",   name: "Scale",   max_seats: 50 },
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.plan.findUniqueOrThrow.mockImplementation(({ where }: { where: { key: string } }) =>
    Promise.resolve(PLANS[where.key]),
  )
})

describe("OCCUPIES_SEAT filter", () => {
  it("counts active members and pending invites, not deactivated members", () => {
    // is_active=false means BOTH "invited, not yet accepted" and "deactivated".
    // joined_at is the only thing separating them, so the filter must key off it.
    expect(OCCUPIES_SEAT).toEqual({
      OR: [{ is_active: true }, { is_active: false, joined_at: null }],
    })
  })

  it("does not match a deactivated member (is_active=false, joined_at set)", () => {
    // Assert the shape excludes the deactivated case rather than trusting prose.
    const clauses = (OCCUPIES_SEAT as { OR: Record<string, unknown>[] }).OR
    const matchesDeactivated = clauses.some(
      (c) => c.is_active === false && !("joined_at" in c && c.joined_at === null),
    )
    expect(matchesDeactivated).toBe(false)
  })
})

describe("getSeatUsage", () => {
  it("reports usage against the subscribed plan", async () => {
    prismaMock.user.count.mockResolvedValue(7)
    prismaMock.subscription.findUnique.mockResolvedValue({ status: "active", plan: PLANS.starter })

    const usage = await getSeatUsage("acc_1")
    expect(usage).toEqual({
      used: 7, limit: 10, remaining: 3, isFull: false, planKey: "starter", planName: "Starter",
    })
  })

  it("marks the account full at exactly the limit, not one past it", async () => {
    prismaMock.user.count.mockResolvedValue(10)
    prismaMock.subscription.findUnique.mockResolvedValue({ status: "active", plan: PLANS.starter })

    const usage = await getSeatUsage("acc_1")
    expect(usage.isFull).toBe(true)
    expect(usage.remaining).toBe(0)
  })

  it("never reports negative remaining when already over limit", async () => {
    prismaMock.user.count.mockResolvedValue(14)
    prismaMock.subscription.findUnique.mockResolvedValue({ status: "active", plan: PLANS.starter })

    const usage = await getSeatUsage("acc_1")
    expect(usage.remaining).toBe(0)
    expect(usage.isFull).toBe(true)
  })

  it("falls back to trial (30) when the account has no subscription row", async () => {
    // Every account predating billing is in this state — it must get a real
    // limit, not an unbounded one.
    prismaMock.user.count.mockResolvedValue(3)
    prismaMock.subscription.findUnique.mockResolvedValue(null)

    const usage = await getSeatUsage("acc_1")
    expect(usage.limit).toBe(30)
    expect(usage.planKey).toBe("trial")
  })

  it("falls back to trial when the subscription is canceled", async () => {
    // A cancelled Scale subscription must stop granting 50 seats.
    prismaMock.user.count.mockResolvedValue(3)
    prismaMock.subscription.findUnique.mockResolvedValue({ status: "canceled", plan: PLANS.scale })

    const usage = await getSeatUsage("acc_1")
    expect(usage.limit).toBe(30)
    expect(usage.planKey).toBe("trial")
  })

  it("keeps the plan's seats while past_due (Razorpay is still retrying)", async () => {
    prismaMock.user.count.mockResolvedValue(40)
    prismaMock.subscription.findUnique.mockResolvedValue({ status: "past_due", plan: PLANS.scale })

    const usage = await getSeatUsage("acc_1")
    expect(usage.limit).toBe(50)
    expect(usage.isFull).toBe(false)
  })
})

describe("seatsExceedPlan", () => {
  it("blocks buying a plan smaller than the current team", async () => {
    prismaMock.user.count.mockResolvedValue(15)
    const r = await seatsExceedPlan("acc_1", "starter")
    expect(r).toEqual({ exceeds: true, used: 15, limit: 10 })
  })

  it("allows a plan that exactly fits the team", async () => {
    prismaMock.user.count.mockResolvedValue(10)
    const r = await seatsExceedPlan("acc_1", "starter")
    expect(r.exceeds).toBe(false)
  })

  it("allows upgrading to a larger plan", async () => {
    prismaMock.user.count.mockResolvedValue(15)
    const r = await seatsExceedPlan("acc_1", "growth")
    expect(r.exceeds).toBe(false)
  })
})
