import { prisma } from "@/lib/prisma"
import type { Prisma, RecommendationEventType, RecommendationSkipReason } from "@prisma/client"

// Server-side writer for the recommendation-interaction funnel. Used for the
// events the SERVER observes (EXECUTED when a rep logs a call/WhatsApp, OUTCOME
// when a lead is won/lost) — as opposed to the client fire-and-forget events
// (SHOWN/EXPANDED/ACCEPTED/IGNORED) in recommendation-telemetry.ts.
//
// Best-effort, exactly like recordScoreEvent: telemetry must NEVER break the
// action that triggered it. Call it AFTER the core transaction commits (with the
// shared client, not a tx handle) so a failed insert can't roll back real work.

export type RecordRecommendationEventInput = {
  account_id: string
  workspace_id?: string | null
  lead_id: string
  user_id?: string | null
  event: RecommendationEventType
  action_label?: string | null
  grade_at_event?: string | null
  confidence_band?: string | null
  skip_reason?: RecommendationSkipReason | null
  detail?: Prisma.InputJsonValue
}

export async function recordRecommendationEvent(input: RecordRecommendationEventInput): Promise<void> {
  try {
    await prisma.recommendationEvent.create({
      data: {
        account_id:      input.account_id,
        workspace_id:    input.workspace_id ?? null,
        lead_id:         input.lead_id,
        user_id:         input.user_id ?? null,
        event:           input.event,
        action_label:    input.action_label ?? null,
        grade_at_event:  input.grade_at_event ?? null,
        confidence_band: input.confidence_band ?? null,
        skip_reason:     input.skip_reason ?? null,
        ...(input.detail !== undefined ? { detail: input.detail } : {}),
      },
    })
  } catch {
    // best-effort telemetry — never break the caller
  }
}
