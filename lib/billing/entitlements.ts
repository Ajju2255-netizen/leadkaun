import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * Per-tier feature entitlements. Which premium features a plan unlocks is a
 * function of the plan's tier rank — this is the single source of truth the
 * product gates on. (The per-account FeatureFlag system in lib/feature-flags.ts
 * is a separate admin override for a handful of keys and is NOT a tier gate.)
 *
 * Tier order — a plan unlocks an entitlement when its rank ≥ the entitlement's
 * minimum rank:
 *
 *   free (0) → starter (1) → growth (2) → scale (3) → enterprise (4)
 *
 * `trial` is the plan key for the Free tier (see the pricing migration), so it
 * ranks 0. An unknown/absent plan also ranks 0 (fails closed to Free).
 */
export const TIER_RANK: Record<string, number> = {
  trial: 0, // "Free"
  free: 0, // alias, in case a row is ever keyed this way
  starter: 1,
  growth: 2,
  scale: 3,
  enterprise: 4,
}

export type Entitlement =
  | "ai_learning"
  | "missed_opportunity"
  | "rep_tracking"
  | "advanced_analytics"
  | "revenue_dashboard"
  | "smart_assignment"
  | "multiple_pipelines"
  | "custom_fields"
  | "multiple_workspaces"
  | "api_access"
  | "webhooks"

/** Minimum tier rank that unlocks each entitlement. */
const MIN_RANK: Record<Entitlement, number> = {
  // Growth (2) and up — the "you're leaving money on the table" upgrade.
  ai_learning: 2,
  missed_opportunity: 2,
  rep_tracking: 2,
  advanced_analytics: 2,
  revenue_dashboard: 2,
  smart_assignment: 2,
  multiple_pipelines: 2,
  custom_fields: 2,
  // Scale (3) and up.
  multiple_workspaces: 3,
  api_access: 3,
  webhooks: 3,
}

/** Human label for the minimum tier of an entitlement, for upgrade prompts. */
export function requiredTierLabel(e: Entitlement): "Growth" | "Scale" {
  return MIN_RANK[e] >= 3 ? "Scale" : "Growth"
}

export type AccountTier = { key: string; name: string; rank: number }

/**
 * The account's effective tier. A canceled subscription (or no subscription at
 * all) falls back to Free — the same fail-closed rule seats use, so a lapsed
 * account can't keep Scale features.
 */
export async function getAccountTier(accountId: string): Promise<AccountTier> {
  const sub = await prisma.subscription.findUnique({
    where: { account_id: accountId },
    select: { status: true, plan: { select: { key: true, name: true } } },
  })
  const key = sub && sub.status !== "canceled" ? sub.plan.key : "trial"
  const name = sub && sub.status !== "canceled" ? sub.plan.name : "Free"
  return { key, name, rank: TIER_RANK[key] ?? 0 }
}

export async function hasEntitlement(accountId: string, e: Entitlement): Promise<boolean> {
  const tier = await getAccountTier(accountId)
  return tier.rank >= MIN_RANK[e]
}

/** Every entitlement the account currently has — handy for the billing API. */
export async function getAccountEntitlements(accountId: string): Promise<Entitlement[]> {
  const tier = await getAccountTier(accountId)
  return (Object.keys(MIN_RANK) as Entitlement[]).filter((e) => tier.rank >= MIN_RANK[e])
}

/** Thrown by requireEntitlement; carries the tier the caller must upgrade to. */
export class FeatureLockedError extends Error {
  constructor(
    readonly entitlement: Entitlement,
    readonly requiredTier: string,
  ) {
    super(`This feature requires the ${requiredTier} plan`)
    this.name = "FeatureLockedError"
  }
}

/**
 * Gate an API route on an entitlement. Throw-based so it composes with the
 * existing try/catch in the route handlers; pair with handleFeatureLock below.
 */
export async function requireEntitlement(accountId: string, e: Entitlement): Promise<void> {
  if (!(await hasEntitlement(accountId, e))) {
    throw new FeatureLockedError(e, requiredTierLabel(e))
  }
}

/**
 * Maps a FeatureLockedError to a 403 the frontend can turn into an upgrade
 * prompt (it carries `requiredTier` + `entitlement`). Returns null for other
 * errors so route handlers can fall through, mirroring handleAuthError:
 *
 *   catch (err) {
 *     return handleAuthError(err) ?? handleFeatureLock(err) ?? apiError(...)
 *   }
 */
export function handleFeatureLock(err: unknown): NextResponse | null {
  if (err instanceof FeatureLockedError) {
    return NextResponse.json(
      { error: err.message, code: "FEATURE_LOCKED", requiredTier: err.requiredTier, entitlement: err.entitlement },
      { status: 403 },
    )
  }
  return null
}
