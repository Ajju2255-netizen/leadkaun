import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"

const UpdateSchema = z.object({
  first_name: z.string().min(1).max(80),
  last_name:  z.string().min(1).max(80),
})

/**
 * PATCH /api/profile
 * Update the current user's first and last name.
 */
export async function PATCH(req: Request) {
  try {
    const session = await requireAuth()
    const { data, error } = await parseBody(req, UpdateSchema)
    if (error) return error

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        first_name: data.first_name.trim(),
        last_name:  data.last_name.trim(),
      },
    })

    return apiSuccess({ ok: true })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
