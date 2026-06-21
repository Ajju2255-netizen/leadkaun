import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireRole, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"

type Params = { params: Promise<{ id: string }> }

/**
 * PATCH /api/workspaces/[id] — rename, set description, archive/unarchive, or
 * make default. ADMIN only. Guards: the default workspace can't be archived,
 * and exactly one default is kept at a time.
 */
const UpdateSchema = z.object({
  name:        z.string().min(1).max(60).optional(),
  description: z.string().max(200).nullable().optional(),
  archived:    z.boolean().optional(),
  is_default:  z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await requireRole("ADMIN")

    const _rl = await rateLimited(`workspace:update:${session.account.id}`, LIMITS.workspace)
    if (_rl) return _rl
    const { id } = await params
    const { data, error } = await parseBody(req, UpdateSchema)
    if (error) return error

    const ws = await prisma.workspace.findFirst({
      where: { id, account_id: session.account.id },
    })
    if (!ws) return apiError("Workspace not found", "NOT_FOUND", 404)

    if (data.archived === true && ws.is_default) {
      return apiError("The default workspace can't be archived. Make another workspace default first.", "CANNOT_ARCHIVE_DEFAULT", 422)
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Setting this workspace default clears the flag on all others.
      if (data.is_default === true) {
        await tx.workspace.updateMany({
          where: { account_id: session.account.id, is_default: true },
          data:  { is_default: false },
        })
      }
      return tx.workspace.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
          ...(data.archived !== undefined ? { archived_at: data.archived ? new Date() : null } : {}),
          ...(data.is_default === true ? { is_default: true } : {}),
        },
      })
    })

    return apiSuccess({ workspace: updated })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    console.error("Workspace update error:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
