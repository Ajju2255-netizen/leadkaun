import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireWorkspace } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * GET /api/settings/follow-up-config
 * Returns per-grade follow-up schedule config for this account.
 *
 * PUT /api/settings/follow-up-config
 * Upserts follow-up config for a grade.
 * Admin only.
 *
 * The `schedule` field is a JSON object: { first_followup_h, second_followup_h, max_followups, action_type }
 */

const ConfigSchema = z.object({
  grade:    z.enum(["A", "B", "C", "D", "E", "F"]),
  schedule: z.object({
    first_followup_h:  z.number().int().min(1),
    second_followup_h: z.number().int().min(1),
    max_followups:     z.number().int().min(1).max(20),
    action_type:       z.enum(["CALL", "WHATSAPP", "EMAIL"]).default("CALL"),
  }),
})

export async function GET(_req: Request) {
  try {
    const session = await requireWorkspace("ADMIN", "MANAGER")

    const configs = await prisma.followUpConfig.findMany({
      where:   { account_id: session.account.id, workspace_id: session.workspace.id },
      orderBy: { grade: "asc" },
    })

    return apiSuccess({ configs })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requireWorkspace("ADMIN")

    const _rl = await rateLimited(`settings:fuconfig:${session.account.id}`, LIMITS.write)
    if (_rl) return _rl

    const { data, error } = await parseBody(req, ConfigSchema)
    if (error) return error

    const config = await prisma.followUpConfig.upsert({
      where:  { workspace_id_grade: { workspace_id: session.workspace.id, grade: data.grade } },
      update: { schedule: data.schedule },
      create: {
        account_id:   session.account.id,
        workspace_id: session.workspace.id,
        grade:        data.grade,
        schedule:     data.schedule,
      },
    })

    return apiSuccess({ config })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
