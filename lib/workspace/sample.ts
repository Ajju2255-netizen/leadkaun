import { prisma } from "@/lib/prisma"

import { SAMPLE_WORKSPACE_SLUG } from "./provision"

/**
 * Activation isolation.
 *
 * The Sample workspace exists to demonstrate the product; it must never
 * contribute to acquisition or activation numbers. Two different things:
 *
 *   Product demo   — "see what Leadkaun can do"        (Sample workspace)
 *   Activation     — "Leadkaun processed MY leads"     (IMPORT_COMPLETED)
 *
 * Every activation-related metric goes through this check, not just
 * FIRST_PRIORITY_VIEWED — a demo lead must not be able to look like a real one
 * anywhere in the funnel.
 */
export function isSampleWorkspace(slug: string | null | undefined): boolean {
  return slug === SAMPLE_WORKSPACE_SLUG
}

/**
 * Remove the Sample workspace and everything seeded into it.
 *
 * Called on demand from the banner, and automatically the first time real leads
 * finish importing — at that point the demo has served its purpose and leaving
 * it behind only risks a user mistaking example leads for their own.
 *
 * Returns false when there is nothing to remove, so callers can stay quiet.
 */
export async function removeSampleWorkspace(accountId: string): Promise<boolean> {
  const ws = await prisma.workspace.findFirst({
    where:  { account_id: accountId, slug: SAMPLE_WORKSPACE_SLUG },
    select: { id: true },
  })
  if (!ws) return false

  // Ordered by foreign key, innermost first. Scoped by workspace throughout, so
  // this can only ever touch sample rows.
  await prisma.$transaction(async (tx) => {
    const leads = await tx.lead.findMany({ where: { workspace_id: ws.id }, select: { id: true } })
    const leadIds = leads.map((l) => l.id)
    if (leadIds.length) {
      await tx.followUpAction.deleteMany({ where: { lead_id: { in: leadIds } } })
      await tx.leadNote.deleteMany({ where: { lead_id: { in: leadIds } } })
      await tx.signal.deleteMany({ where: { lead_id: { in: leadIds } } })
      await tx.stageHistory.deleteMany({ where: { lead_id: { in: leadIds } } })
      await tx.leadScoreEvent.deleteMany({ where: { lead_id: { in: leadIds } } })
      await tx.winAttribution.deleteMany({ where: { lead_id: { in: leadIds } } })
      await tx.notification.deleteMany({ where: { lead_id: { in: leadIds } } })
      await tx.recommendationEvent.deleteMany({ where: { lead_id: { in: leadIds } } })
      await tx.lead.deleteMany({ where: { workspace_id: ws.id } })
    }
    await tx.workspaceMember.deleteMany({ where: { workspace_id: ws.id } })
    await tx.pipelineStage.deleteMany({ where: { workspace_id: ws.id } })
    await tx.leadSource.deleteMany({ where: { workspace_id: ws.id } })
    await tx.workspace.delete({ where: { id: ws.id } })
  }, { timeout: 30000 })

  return true
}
