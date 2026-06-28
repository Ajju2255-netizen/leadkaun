// Per-account feature flags. NEUTRAL: the product reads its own flags here; the
// admin panel writes them. A missing row = default ON. Best-effort reads default
// to enabled so a DB hiccup never hides a feature.

import { prisma } from "@/lib/prisma"

export const FEATURE_KEYS = ["learning_engine", "queue", "pipeline", "analytics", "confidence"] as const
export type FeatureKey = (typeof FEATURE_KEYS)[number]

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  learning_engine: "Learning Engine",
  queue:           "Priority Queue",
  pipeline:        "Pipeline",
  analytics:       "Analytics",
  confidence:      "Confidence Score",
}

export async function isFeatureEnabled(accountId: string, key: FeatureKey): Promise<boolean> {
  try {
    const flag = await prisma.featureFlag.findUnique({ where: { account_id_key: { account_id: accountId, key } } })
    return flag ? flag.enabled : true
  } catch {
    return true // never hide a feature on a read error
  }
}

export async function getAccountFlags(accountId: string): Promise<Record<FeatureKey, boolean>> {
  const rows = await prisma.featureFlag.findMany({ where: { account_id: accountId } })
  const map = Object.fromEntries(FEATURE_KEYS.map((k) => [k, true])) as Record<FeatureKey, boolean>
  for (const r of rows) if (r.key in map) map[r.key as FeatureKey] = r.enabled
  return map
}
