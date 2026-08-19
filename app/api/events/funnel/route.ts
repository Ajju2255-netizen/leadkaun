import type { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { recordAccountEvent } from "@/lib/events/account-events"
import { isSampleWorkspace } from "@/lib/workspace/sample"

export const dynamic = "force-dynamic"

/**
 * POST /api/events/funnel — record one activation-funnel step.
 *
 * The funnel we need to see is:
 *   signup → onboarding_started → import_started → analysis_completed
 *          → report_viewed → import_approved → import_completed
 *          → first_priority_viewed
 *
 * Some of those only exist in the browser (a report being *viewed*, a queue
 * being *reached*), so they are posted here rather than inferred server-side.
 *
 * Steps are whitelisted: this endpoint must never become a way for a client to
 * write arbitrary event types into the company timeline.
 */
const STEPS = {
  onboarding_started:    "ONBOARDING_STARTED",
  import_started:        "IMPORT_STARTED",
  analysis_completed:    "ANALYSIS_COMPLETED",
  report_viewed:         "REPORT_VIEWED",
  import_approved:       "IMPORT_APPROVED",
  first_priority_viewed: "FIRST_PRIORITY_VIEWED",
} as const

type Step = keyof typeof STEPS

const SUMMARY: Record<Step, string> = {
  onboarding_started:    "Started onboarding",
  import_started:        "Started a lead import",
  analysis_completed:    "Lead file analysed",
  report_viewed:         "Viewed the import intelligence report",
  import_approved:       "Approved the import",
  first_priority_viewed: "Reached the priority queue with leads",
}

export async function POST(req: Request) {
  try {
    const session = await requireAuth()

    let body: { step?: string; detail?: Prisma.InputJsonValue }
    try {
      body = await req.json()
    } catch {
      return apiError("Invalid JSON", "BAD_REQUEST", 400)
    }

    const step = body.step as Step | undefined
    if (!step || !(step in STEPS)) {
      return apiError("Unknown funnel step", "BAD_REQUEST", 400)
    }

    /**
     * Activation isolation — the Sample workspace demonstrates the product, it
     * does not activate an account. Exploring 24 example leads must never make
     * the funnel report that a user reached prioritisation with real data.
     *
     * Enforced here rather than only at the call site so no client path, and no
     * future caller, can bypass it.
     */
    if (isSampleWorkspace(session.workspace?.slug)) {
      return apiSuccess({ ok: true, skipped: "sample-workspace" })
    }

    /**
     * Milestones, not counters. A user who re-uploads or revisits the queue
     * should not inflate the funnel, so each step is recorded once per account.
     */
    const type = STEPS[step]
    const already = await prisma.accountEvent.findFirst({
      where: { account_id: session.account.id, type },
      select: { id: true },
    })
    if (already) return apiSuccess({ ok: true, deduped: true })

    await recordAccountEvent({
      accountId:   session.account.id,
      actorUserId: session.user.id,
      type,
      summary:     SUMMARY[step],
      detail:      body.detail ?? undefined,
    })

    return apiSuccess({ ok: true })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
