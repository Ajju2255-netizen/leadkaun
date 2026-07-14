import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireRole, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * GET    /api/workspaces/[id]/members — current members + the account users not
 *                                       yet assigned (to populate the picker).
 * POST   /api/workspaces/[id]/members — add a user ({ user_id }).
 * DELETE /api/workspaces/[id]/members?user_id=... — remove a user.
 * ADMIN only. Account role (ADMIN/MANAGER/REP) is what governs in-workspace
 * permissions — membership is pure assignment.
 */

async function getWorkspace(id: string, accountId: string) {
  return prisma.workspace.findFirst({ where: { id, account_id: accountId } })
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await requireRole("ADMIN")
    const { id } = await params
    const ws = await getWorkspace(id, session.account.id)
    if (!ws) return apiError("Workspace not found", "NOT_FOUND", 404)

    const [memberRows, allUsers] = await Promise.all([
      prisma.workspaceMember.findMany({
        where:  { workspace_id: id },
        select: { user: { select: { id: true, first_name: true, last_name: true, email: true, role: true, is_active: true } } },
      }),
      prisma.user.findMany({
        where:  { account_id: session.account.id, is_active: true },
        select: { id: true, first_name: true, last_name: true, email: true, role: true },
        orderBy: [{ role: "asc" }, { first_name: "asc" }],
      }),
    ])

    const members = memberRows.map((m) => m.user)
    const memberIds = new Set(members.map((m) => m.id))
    const available = allUsers.filter((u) => !memberIds.has(u.id))

    return apiSuccess({ members, available })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}

const AddSchema = z.object({ user_id: z.string().min(1) })

export async function POST(req: Request, { params }: Params) {
  try {
    const session = await requireRole("ADMIN")

    const _rl = await rateLimited(`workspace:members:${session.account.id}`, LIMITS.workspace)
    if (_rl) return _rl

    const { id } = await params
    const { data, error } = await parseBody(req, AddSchema)
    if (error) return error

    const ws = await getWorkspace(id, session.account.id)
    if (!ws) return apiError("Workspace not found", "NOT_FOUND", 404)

    const user = await prisma.user.findFirst({ where: { id: data.user_id, account_id: session.account.id } })
    if (!user) return apiError("User not found in this account", "NOT_FOUND", 404)

    await prisma.workspaceMember.upsert({
      where:  { workspace_id_user_id: { workspace_id: id, user_id: data.user_id } },
      create: { workspace_id: id, user_id: data.user_id },
      update: {},
    })

    return apiSuccess({ added: true }, 201)
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const session = await requireRole("ADMIN")

    const _rl = await rateLimited(`workspace:members:${session.account.id}`, LIMITS.workspace)
    if (_rl) return _rl

    const { id } = await params
    const userId = new URL(req.url).searchParams.get("user_id")
    if (!userId) return apiError("user_id is required", "MISSING_USER", 422)

    const ws = await getWorkspace(id, session.account.id)
    if (!ws) return apiError("Workspace not found", "NOT_FOUND", 404)

    await prisma.workspaceMember.deleteMany({ where: { workspace_id: id, user_id: userId } })
    return apiSuccess({ removed: true })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
