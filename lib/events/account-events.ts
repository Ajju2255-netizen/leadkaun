// Account-level event capture (telemetry). NEUTRAL location: product code writes
// events here; only the admin panel (lib/admin) reads them. This keeps the
// customer app from importing any admin code while still feeding the Company
// Timeline + live activity feed. Best-effort — never throws, never blocks the
// core path (mirrors lib/scoring/score-events.ts).

import { prisma } from "@/lib/prisma"
import type { AccountEventType, Prisma } from "@prisma/client"

export async function recordAccountEvent(input: {
  accountId: string
  type: AccountEventType
  summary: string
  workspaceId?: string | null
  actorUserId?: string | null
  detail?: Prisma.InputJsonValue
}): Promise<void> {
  try {
    await prisma.accountEvent.create({
      data: {
        account_id:    input.accountId,
        type:          input.type,
        summary:       input.summary,
        workspace_id:  input.workspaceId ?? null,
        actor_user_id: input.actorUserId ?? null,
        detail:        input.detail,
      },
    })
  } catch (e) {
    console.error("[account-event] failed to record", input.type, e)
  }
}
