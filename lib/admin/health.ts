// Customer health + churn-risk for Mission Control (admin-only). A transparent
// weighted score over real usage signals — no black box. Each missing input is
// surfaced as a reason so support knows *why* an account is at risk.

import { prisma } from "@/lib/prisma"
import { RECOMMENDATION_TOP_N } from "@/lib/analytics/recommendation-rank"

export type HealthBand = "healthy" | "warning" | "critical"
export type ChurnRisk = "low" | "medium" | "high"

export type AccountHealth = {
  score: number // 0–100
  band: HealthBand
  churnRisk: ChurnRisk
  reasons: string[] // what's dragging it down
}

// Weights sum to 100.
const W = { imports: 20, activeUsers: 20, adoption: 20, activity: 25, briefOpens: 15 }

export async function computeAccountHealth(accountId: string): Promise<AccountHealth> {
  const d14 = new Date(Date.now() - 14 * 86_400_000)

  const [importsRecent, activeUsers, contacted, adopted, signals14, briefOpens] = await Promise.all([
    prisma.importJobStatus.count({ where: { account_id: accountId, created_at: { gte: d14 } } }),
    prisma.signal.findMany({ where: { account_id: accountId, created_at: { gte: d14 }, user_id: { not: null } }, distinct: ["user_id"], select: { user_id: true } }),
    prisma.lead.count({ where: { account_id: accountId, first_action_rank: { not: null } } }),
    prisma.lead.count({ where: { account_id: accountId, first_action_rank: { not: null, lte: RECOMMENDATION_TOP_N } } }),
    prisma.signal.count({ where: { account_id: accountId, created_at: { gte: d14 } } }),
    prisma.emailLog.count({ where: { account_id: accountId, opened_at: { not: null }, created_at: { gte: d14 } } }),
  ])

  const reasons: string[] = []
  let score = 0

  if (importsRecent > 0) score += W.imports
  else reasons.push("No imports in 14 days")

  if (activeUsers.length > 0) score += W.activeUsers
  else reasons.push("No active users in 14 days")

  const adoptionPct = contacted > 0 ? adopted / contacted : 0
  score += Math.round(adoptionPct * W.adoption)
  if (contacted > 0 && adoptionPct < 0.3) reasons.push("Low recommendation adoption")

  if (signals14 >= 10) score += W.activity
  else if (signals14 > 0) score += Math.round(W.activity * 0.5)
  else reasons.push("No activity in 14 days")

  if (briefOpens > 0) score += W.briefOpens
  else reasons.push("Not opening morning briefs")

  score = Math.max(0, Math.min(100, score))
  const band: HealthBand = score >= 70 ? "healthy" : score >= 40 ? "warning" : "critical"
  const churnRisk: ChurnRisk = score < 40 ? "high" : score < 70 ? "medium" : "low"

  return { score, band, churnRisk, reasons }
}
