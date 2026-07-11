import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  getAccountTier,
  hasEntitlement,
  getAccountEntitlements,
  requireEntitlement,
  requiredTierLabel,
  FeatureLockedError,
} from "@/lib/billing/entitlements"

const prismaMock = vi.hoisted(() => ({
  subscription: { findUnique: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const sub = (status: string, key: string, name: string) => ({ status, plan: { key, name } })

beforeEach(() => vi.clearAllMocks())

describe("getAccountTier", () => {
  it("reads the subscribed plan's tier", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(sub("active", "growth", "Growth"))
    expect(await getAccountTier("a")).toEqual({ key: "growth", name: "Growth", rank: 2 })
  })

  it("falls back to Free when there is no subscription", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null)
    expect(await getAccountTier("a")).toEqual({ key: "trial", name: "Free", rank: 0 })
  })

  it("falls back to Free when the subscription is canceled", async () => {
    // A lapsed Scale account must not keep Scale features.
    prismaMock.subscription.findUnique.mockResolvedValue(sub("canceled", "scale", "Scale"))
    expect((await getAccountTier("a")).rank).toBe(0)
  })
})

describe("hasEntitlement", () => {
  it("locks Growth features on Free and Starter", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(sub("active", "starter", "Starter"))
    expect(await hasEntitlement("a", "missed_opportunity")).toBe(false)
    expect(await hasEntitlement("a", "ai_learning")).toBe(false)
    expect(await hasEntitlement("a", "rep_tracking")).toBe(false)
  })

  it("unlocks Growth features on Growth", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(sub("active", "growth", "Growth"))
    expect(await hasEntitlement("a", "missed_opportunity")).toBe(true)
    expect(await hasEntitlement("a", "ai_learning")).toBe(true)
  })

  it("keeps Scale-only features locked on Growth", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(sub("active", "growth", "Growth"))
    expect(await hasEntitlement("a", "multiple_workspaces")).toBe(false)
    expect(await hasEntitlement("a", "api_access")).toBe(false)
  })

  it("unlocks everything on Scale and Enterprise", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(sub("active", "scale", "Scale"))
    expect(await hasEntitlement("a", "multiple_workspaces")).toBe(true)
    expect(await hasEntitlement("a", "webhooks")).toBe(true)
    prismaMock.subscription.findUnique.mockResolvedValue(sub("active", "enterprise", "Enterprise"))
    expect(await hasEntitlement("a", "api_access")).toBe(true)
  })
})

describe("getAccountEntitlements", () => {
  it("returns nothing on Free", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null)
    expect(await getAccountEntitlements("a")).toEqual([])
  })

  it("returns Growth features but not Scale features on Growth", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(sub("active", "growth", "Growth"))
    const ents = await getAccountEntitlements("a")
    expect(ents).toContain("missed_opportunity")
    expect(ents).not.toContain("multiple_workspaces")
  })
})

describe("requireEntitlement", () => {
  it("throws FeatureLockedError with the right target tier when locked", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null) // Free
    await expect(requireEntitlement("a", "missed_opportunity")).rejects.toBeInstanceOf(FeatureLockedError)
    await expect(requireEntitlement("a", "api_access")).rejects.toMatchObject({ requiredTier: "Scale" })
  })

  it("resolves when the account has the entitlement", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(sub("active", "growth", "Growth"))
    await expect(requireEntitlement("a", "missed_opportunity")).resolves.toBeUndefined()
  })
})

describe("requiredTierLabel", () => {
  it("maps entitlements to Growth or Scale", () => {
    expect(requiredTierLabel("missed_opportunity")).toBe("Growth")
    expect(requiredTierLabel("multiple_workspaces")).toBe("Scale")
  })
})
