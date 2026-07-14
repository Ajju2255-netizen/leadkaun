import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, requireRole, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { provisionWorkspaceDefaults, slugify } from "@/lib/workspace/provision"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import { requireEntitlement, handleFeatureLock } from "@/lib/billing/entitlements"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * GET  /api/workspaces — workspaces the caller can access (ADMIN: all in the
 *                        account; others: the ones they're a member of), with
 *                        member + lead counts for the settings page.
 * POST /api/workspaces — create a workspace (ADMIN). Seeds default pipeline +
 *                        sources and adds the creator as a member.
 */

export async function GET() {
  try {
    const session = await requireAuth()
    const isAdmin = session.user.role === "ADMIN"

    const rows = await prisma.workspace.findMany({
      where: isAdmin
        ? { account_id: session.account.id }
        : { account_id: session.account.id, archived_at: null, members: { some: { user_id: session.user.id } } },
      orderBy: [{ is_default: "desc" }, { name: "asc" }],
      select: {
        id: true, name: true, slug: true, description: true, color: true,
        is_default: true, archived_at: true,
        _count: { select: { members: true } },
      },
    })

    // Lead counts per workspace (leads use a scalar workspace_id, not a relation)
    const leadCounts = await prisma.lead.groupBy({
      by: ["workspace_id"],
      where: { account_id: session.account.id, workspace_id: { in: rows.map((w) => w.id) } },
      _count: { _all: true },
    })
    const leadCountMap = new Map(leadCounts.map((c) => [c.workspace_id, c._count._all]))

    const workspaces = rows.map((w) => ({
      ...w,
      member_count: w._count.members,
      lead_count:   leadCountMap.get(w.id) ?? 0,
    }))

    return apiSuccess({ workspaces, active_id: session.workspace?.id ?? null })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}

const CreateSchema = z.object({
  name:        z.string().min(1).max(60),
  description: z.string().max(200).optional(),
})

export async function POST(req: Request) {
  try {
    const session = await requireRole("ADMIN")

    const limited = await rateLimited(`workspace:create:${session.account.id}`, LIMITS.workspace)
    if (limited) return limited

    // Multiple workspaces are a Scale feature. Every account gets one default
    // workspace at signup, so a second one requires the entitlement.
    const wsCount = await prisma.workspace.count({
      where: { account_id: session.account.id, archived_at: null },
    })
    if (wsCount >= 1) {
      await requireEntitlement(session.account.id, "multiple_workspaces")
    }

    const { data, error } = await parseBody(req, CreateSchema)
    if (error) return error

    // Unique slug within the account
    const base = slugify(data.name)
    const existing = await prisma.workspace.findMany({
      where:  { account_id: session.account.id, slug: { startsWith: base } },
      select: { slug: true },
    })
    const taken = new Set(existing.map((w) => w.slug))
    let slug = base
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`

    const workspace = await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({
        data: {
          account_id:  session.account.id,
          name:        data.name.trim(),
          slug,
          description: data.description?.trim() || null,
          is_default:  false,
        },
      })
      // Creator is the first member; seed default funnel + sources
      await tx.workspaceMember.create({ data: { workspace_id: ws.id, user_id: session.user.id } })
      await provisionWorkspaceDefaults(tx, { accountId: session.account.id, workspaceId: ws.id })
      return ws
    })

    return apiSuccess({ workspace }, 201)
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    const locked = handleFeatureLock(err)
    if (locked) return locked
    console.error("Workspace create error:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
