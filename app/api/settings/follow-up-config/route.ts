import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"

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
    const session = await requireRole("ADMIN", "MANAGER")

    const configs = await prisma.followUpConfig.findMany({
      where:   { account_id: session.account.id },
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
    const session = await requireRole("ADMIN")

    const { data, error } = await parseBody(req, ConfigSchema)
    if (error) return error

    const config = await prisma.followUpConfig.upsert({
      where:  { account_id_grade: { account_id: session.account.id, grade: data.grade } },
      update: { schedule: data.schedule },
      create: {
        account_id: session.account.id,
        grade:      data.grade,
        schedule:   data.schedule,
      },
    })

    return apiSuccess({ config })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
