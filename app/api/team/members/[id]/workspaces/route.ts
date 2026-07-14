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
 * Manage which workspaces a single team member can access, from the Team page.
 *
 * GET    /api/team/members/[id]/workspaces — every non-archived workspace in the
 *        account, each flagged with `member` (whether this user is assigned).
 * POST   /api/team/members/[id]/workspaces — add the member ({ workspace_id }).
 * DELETE /api/team/members/[id]/workspaces?workspace_id=... — remove the member.
 *
 * ADMIN only. Note: ADMINs implicitly see every workspace regardless of
 * membership rows (see resolveWorkspaces); membership only gates MANAGER/REP.
 */

async function getMember(id: string, accountId: string) {
  return prisma.user.findFirst({ where: { id, account_id: accountId } })
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await requireRole("ADMIN")
    const { id } = await params

    const member = await getMember(id, session.account.id)
    if (!member) return apiError("Team member not found", "NOT_FOUND", 404)

    const [workspaces, memberRows] = await Promise.all([
      prisma.workspace.findMany({
        where:   { account_id: session.account.id, archived_at: null },
        select:  { id: true, name: true, is_default: true },
        orderBy: [{ is_default: "desc" }, { name: "asc" }],
      }),
      prisma.workspaceMember.findMany({
        where:  { user_id: id },
        select: { workspace_id: true },
      }),
    ])

    const memberOf = new Set(memberRows.map((m) => m.workspace_id))
    const result = workspaces.map((w) => ({ ...w, member: memberOf.has(w.id) }))

    return apiSuccess({ workspaces: result, role: member.role })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}

const AddSchema = z.object({ workspace_id: z.string().min(1) })

export async function POST(req: Request, { params }: Params) {
  try {
    const session = await requireRole("ADMIN")

    const _rl = await rateLimited(`workspace:members:${session.account.id}`, LIMITS.workspace)
    if (_rl) return _rl

    const { id } = await params
    const { data, error } = await parseBody(req, AddSchema)
    if (error) return error

    const member = await getMember(id, session.account.id)
    if (!member) return apiError("Team member not found", "NOT_FOUND", 404)

    const ws = await prisma.workspace.findFirst({
      where: { id: data.workspace_id, account_id: session.account.id },
    })
    if (!ws) return apiError("Workspace not found", "NOT_FOUND", 404)

    await prisma.workspaceMember.upsert({
      where:  { workspace_id_user_id: { workspace_id: data.workspace_id, user_id: id } },
      create: { workspace_id: data.workspace_id, user_id: id },
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
    const workspaceId = new URL(req.url).searchParams.get("workspace_id")
    if (!workspaceId) return apiError("workspace_id is required", "MISSING_WORKSPACE", 422)

    const member = await getMember(id, session.account.id)
    if (!member) return apiError("Team member not found", "NOT_FOUND", 404)

    const ws = await prisma.workspace.findFirst({
      where: { id: workspaceId, account_id: session.account.id },
    })
    if (!ws) return apiError("Workspace not found", "NOT_FOUND", 404)

    await prisma.workspaceMember.deleteMany({ where: { workspace_id: workspaceId, user_id: id } })

    return apiSuccess({ removed: true })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
