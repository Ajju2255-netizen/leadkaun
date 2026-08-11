// ─────────────────────────────────────────────
// USERS — every user in the system, across every tenant.
//
// Support's first question is almost always "who is this person and what have
// they done?". This answers it without opening five screens: account, role,
// workspaces, whether they ever accepted their invite, what they've worked, and
// when they were last seen.
//
// Seat semantics come straight from lib/billing/seats.ts — an invited-but-never-
// accepted user (is_active=false, joined_at=null) still OCCUPIES a seat, and
// that distinction is surfaced rather than collapsed into "inactive".
// ─────────────────────────────────────────────

import { prisma } from "@/lib/prisma"
import { RECOMMENDATION_TOP_N } from "@/lib/analytics/recommendation-rank"
import type { UserRole, Prisma } from "@prisma/client"

export type UserStatus = "active" | "invited" | "deactivated"

export type UserRow = {
  id: string
  name: string
  email: string
  role: UserRole
  status: UserStatus
  occupiesSeat: boolean
  accountId: string
  accountName: string
  workspaces: number
  assignedLeads: number
  signals: number
  adoptedRecommendations: number
  wonLeads: number
  lastActiveAt: Date | null
  invitedAt: Date | null
  joinedAt: Date | null
  createdAt: Date
}

export type UserFilters = {
  q?: string
  role?: UserRole
  status?: UserStatus
  accountId?: string
  sort?: "recent" | "active" | "leads" | "name"
}

function statusOf(u: { is_active: boolean; joined_at: Date | null }): UserStatus {
  if (u.is_active) return "active"
  return u.joined_at == null ? "invited" : "deactivated"
}

export async function listUsers(f: UserFilters = {}): Promise<UserRow[]> {
  const where: Prisma.UserWhereInput = {}
  if (f.accountId) where.account_id = f.accountId
  if (f.role) where.role = f.role
  if (f.q) {
    where.OR = [
      { email: { contains: f.q, mode: "insensitive" } },
      { first_name: { contains: f.q, mode: "insensitive" } },
      { last_name: { contains: f.q, mode: "insensitive" } },
    ]
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true, first_name: true, last_name: true, email: true, role: true,
      is_active: true, invited_at: true, joined_at: true, created_at: true,
      account_id: true, account: { select: { name: true } },
      _count: { select: { workspace_members: true } },
    },
    orderBy: { created_at: "desc" },
    take: 500,
  })
  if (users.length === 0) return []

  const ids = users.map((u) => u.id)
  const [assignedBy, signalsBy, lastBy, adoptedBy, wonBy] = await Promise.all([
    prisma.lead.groupBy({ by: ["assigned_rep_id"], where: { assigned_rep_id: { in: ids } }, _count: { _all: true } }),
    prisma.signal.groupBy({
      by: ["user_id"], where: { user_id: { in: ids }, signal_type: { not: "SOURCE_BASELINE" } }, _count: { _all: true },
    }),
    prisma.signal.groupBy({ by: ["user_id"], where: { user_id: { in: ids } }, _max: { created_at: true } }),
    prisma.lead.groupBy({
      by: ["assigned_rep_id"],
      where: { assigned_rep_id: { in: ids }, first_action_rank: { not: null, lte: RECOMMENDATION_TOP_N } },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["assigned_rep_id"], where: { assigned_rep_id: { in: ids }, won_at: { not: null } }, _count: { _all: true },
    }),
  ])

  const assigned = new Map(assignedBy.map((r) => [r.assigned_rep_id ?? "", r._count._all]))
  const signals = new Map(signalsBy.map((r) => [r.user_id ?? "", r._count._all]))
  const last = new Map(lastBy.map((r) => [r.user_id ?? "", r._max.created_at]))
  const adopted = new Map(adoptedBy.map((r) => [r.assigned_rep_id ?? "", r._count._all]))
  const won = new Map(wonBy.map((r) => [r.assigned_rep_id ?? "", r._count._all]))

  let rows: UserRow[] = users.map((u) => {
    const status = statusOf(u)
    return {
      id: u.id,
      name: `${u.first_name} ${u.last_name ?? ""}`.trim() || u.email,
      email: u.email,
      role: u.role,
      status,
      occupiesSeat: status !== "deactivated",
      accountId: u.account_id,
      accountName: u.account.name,
      workspaces: u._count.workspace_members,
      assignedLeads: assigned.get(u.id) ?? 0,
      signals: signals.get(u.id) ?? 0,
      adoptedRecommendations: adopted.get(u.id) ?? 0,
      wonLeads: won.get(u.id) ?? 0,
      lastActiveAt: last.get(u.id) ?? null,
      invitedAt: u.invited_at,
      joinedAt: u.joined_at,
      createdAt: u.created_at,
    }
  })

  if (f.status) rows = rows.filter((r) => r.status === f.status)

  const sorters: Record<string, (a: UserRow, b: UserRow) => number> = {
    recent: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    active: (a, b) => (b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0),
    leads: (a, b) => b.assignedLeads - a.assignedLeads,
    name: (a, b) => a.name.localeCompare(b.name),
  }
  rows.sort(sorters[f.sort ?? "recent"] ?? sorters.recent)
  return rows
}

export type UserCounts = { total: number; active: number; invited: number; deactivated: number; byRole: Record<string, number> }

export async function getUserCounts(): Promise<UserCounts> {
  const [total, active, invited, deactivated, byRole] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { is_active: true } }),
    prisma.user.count({ where: { is_active: false, joined_at: null } }),
    prisma.user.count({ where: { is_active: false, joined_at: { not: null } } }),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
  ])
  return {
    total, active, invited, deactivated,
    byRole: Object.fromEntries(byRole.map((r) => [r.role, r._count._all])),
  }
}
