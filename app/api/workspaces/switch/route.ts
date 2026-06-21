import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiError, parseBody } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import { WORKSPACE_COOKIE } from "@/lib/auth/session"

/**
 * POST /api/workspaces/switch — set the active workspace for this session.
 * Validates the caller can access it (ADMIN: any in account; others: must be a
 * member) before writing the `lk_ws` cookie. The client then router.refresh()es.
 */
const SwitchSchema = z.object({ workspace_id: z.string().min(1) })

export async function POST(req: Request) {
  try {
    const session = await requireAuth()

    const limited = await rateLimited(`workspace:switch:${session.user.id}`, LIMITS.write)
    if (limited) return limited

    const { data, error } = await parseBody(req, SwitchSchema)
    if (error) return error

    const accessible = session.user.role === "ADMIN"
      ? await prisma.workspace.findFirst({ where: { id: data.workspace_id, account_id: session.account.id, archived_at: null } })
      : await prisma.workspace.findFirst({
          where: { id: data.workspace_id, account_id: session.account.id, archived_at: null, members: { some: { user_id: session.user.id } } },
        })
    if (!accessible) return apiError("Workspace not found or not accessible", "FORBIDDEN", 403)

    const res = Response.json({ switched: true, workspace_id: data.workspace_id })
    // 1-year cookie; httpOnly so only the server reads it (session resolution).
    res.headers.append(
      "Set-Cookie",
      `${WORKSPACE_COOKIE}=${data.workspace_id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`,
    )
    return res
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
