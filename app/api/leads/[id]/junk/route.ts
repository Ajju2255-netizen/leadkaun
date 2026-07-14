import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody, NOT_FOUND } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

type Params = { params: { id: string } }

const JunkSchema = z.object({
  flags:  z.array(z.string()).min(1), // e.g. ["duplicate_phone", "test_lead", "invalid_number"]
  reason: z.string().optional().nullable(),
})

/**
 * POST /api/leads/[id]/junk
 * Mark a lead as junk and quarantine it.
 * Junk leads are excluded from queue and analytics by default.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await requireWorkspace()

    const _rl = await rateLimited(`lead-action:${session.user.id}`, LIMITS.write)
    if (_rl) return _rl
    const { data, error } = await parseBody(req, JunkSchema)
    if (error) return error

    const lead = await prisma.lead.findFirst({
      where: { id: params.id, account_id: session.account.id, workspace_id: session.workspace.id },
    })
    if (!lead) return NOT_FOUND("Lead")

    await prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: params.id },
        data: {
          is_junk:    true,
          junk_flags: { set: Array.from(new Set([...lead.junk_flags, ...data.flags])) },
        },
      })

      if (data.reason) {
        await tx.leadNote.create({
          data: {
            lead_id: params.id,
            user_id: session.user.id,
            content: `Marked as junk (${data.flags.join(", ")}): ${data.reason}`,
          },
        })
      }
    })

    return apiSuccess({ junk: true, flags: data.flags })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
