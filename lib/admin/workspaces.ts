// ─────────────────────────────────────────────
// WORKSPACES — the operational unit, seen across every tenant.
//
// A workspace is where leads, pipeline, sources and membership actually live
// (ICP/scoring stays at the account level). This is the only place we can see
// them all at once: which are producing, which were created and abandoned,
// which are archived but still holding leads.
// ─────────────────────────────────────────────

import { prisma } from "@/lib/prisma"
import { ACTIVE_LEAD } from "@/lib/billing/lead-usage"
import type { LeadGrade } from "@prisma/client"

export type WorkspaceRow = {
  id: string
  name: string
  slug: string
  accountId: string
  accountName: string
  isDefault: boolean
  archivedAt: Date | null
  createdAt: Date
  members: number
  leads: number
  activeLeads: number
  won: number
  lastActiveAt: Date | null
  intakeSessions: number
}

export type WorkspaceFilters = {
  q?: string
  accountId?: string
  /** active · archived · empty (no leads) · idle (no signal in 14d) */
  state?: string
  sort?: "leads" | "recent" | "active" | "name"
}

export async function listWorkspaces(f: WorkspaceFilters = {}): Promise<WorkspaceRow[]> {
  const [workspaces, leadsBy, activeBy, wonBy, lastBy, intakeBy] = await Promise.all([
    prisma.workspace.findMany({
      where: f.accountId ? { account_id: f.accountId } : undefined,
      select: {
        id: true, name: true, slug: true, account_id: true, is_default: true,
        archived_at: true, created_at: true,
        account: { select: { name: true } },
        _count: { select: { members: true } },
      },
      orderBy: { created_at: "desc" },
    }),
    prisma.lead.groupBy({ by: ["workspace_id"], _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["workspace_id"], where: ACTIVE_LEAD, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["workspace_id"], where: { won_at: { not: null } }, _count: { _all: true } }),
    prisma.signal.groupBy({ by: ["workspace_id"], _max: { created_at: true } }),
    prisma.intakeSession.groupBy({ by: ["workspace_id"], _count: { _all: true } }),
  ])

  const leads = new Map(leadsBy.map((r) => [r.workspace_id ?? "", r._count._all]))
  const active = new Map(activeBy.map((r) => [r.workspace_id ?? "", r._count._all]))
  const won = new Map(wonBy.map((r) => [r.workspace_id ?? "", r._count._all]))
  const last = new Map(lastBy.map((r) => [r.workspace_id ?? "", r._max.created_at]))
  const intake = new Map(intakeBy.map((r) => [r.workspace_id ?? "", r._count._all]))

  let rows: WorkspaceRow[] = workspaces.map((w) => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
    accountId: w.account_id,
    accountName: w.account.name,
    isDefault: w.is_default,
    archivedAt: w.archived_at,
    createdAt: w.created_at,
    members: w._count.members,
    leads: leads.get(w.id) ?? 0,
    activeLeads: active.get(w.id) ?? 0,
    won: won.get(w.id) ?? 0,
    lastActiveAt: last.get(w.id) ?? null,
    intakeSessions: intake.get(w.id) ?? 0,
  }))

  if (f.q) {
    const q = f.q.toLowerCase()
    rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.accountName.toLowerCase().includes(q))
  }
  const d14 = Date.now() - 14 * 86_400_000
  if (f.state === "active") rows = rows.filter((r) => r.archivedAt == null)
  if (f.state === "archived") rows = rows.filter((r) => r.archivedAt != null)
  if (f.state === "empty") rows = rows.filter((r) => r.leads === 0)
  if (f.state === "idle") rows = rows.filter((r) => r.leads > 0 && (!r.lastActiveAt || r.lastActiveAt.getTime() < d14))

  const sorters: Record<string, (a: WorkspaceRow, b: WorkspaceRow) => number> = {
    leads: (a, b) => b.leads - a.leads,
    recent: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    active: (a, b) => (b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0),
    name: (a, b) => a.name.localeCompare(b.name),
  }
  rows.sort(sorters[f.sort ?? "leads"] ?? sorters.leads)
  return rows
}

export type WorkspaceDetail = {
  row: WorkspaceRow
  gradeDistribution: { grade: LeadGrade; count: number; pct: number }[]
  stages: { name: string; count: number; isTerminal: boolean }[]
  sources: { name: string; count: number; intentBaseline: number; reliability: number }[]
  members: { id: string; name: string; email: string; role: string; isActive: boolean }[]
}

export async function getWorkspaceDetail(workspaceId: string): Promise<WorkspaceDetail | null> {
  const rows = await listWorkspaces({})
  const row = rows.find((r) => r.id === workspaceId)
  if (!row) return null

  const [byGrade, stages, byStage, sources, bySource, members] = await Promise.all([
    prisma.lead.groupBy({ by: ["grade"], where: { workspace_id: workspaceId }, _count: { _all: true } }),
    prisma.pipelineStage.findMany({
      where: { workspace_id: workspaceId },
      select: { id: true, name: true, is_terminal: true, display_order: true },
      orderBy: { display_order: "asc" },
    }),
    prisma.lead.groupBy({ by: ["stage_id"], where: { workspace_id: workspaceId }, _count: { _all: true } }),
    prisma.leadSource.findMany({
      where: { workspace_id: workspaceId },
      select: { id: true, name: true, intent_baseline: true, reliability_score: true },
    }),
    prisma.lead.groupBy({ by: ["source_id"], where: { workspace_id: workspaceId }, _count: { _all: true } }),
    prisma.workspaceMember.findMany({
      where: { workspace_id: workspaceId },
      select: { user: { select: { id: true, first_name: true, last_name: true, email: true, role: true, is_active: true } } },
    }),
  ])

  const total = byGrade.reduce((s, g) => s + g._count._all, 0)
  const stageCount = new Map(byStage.map((r) => [r.stage_id, r._count._all]))
  const sourceCount = new Map(bySource.map((r) => [r.source_id, r._count._all]))

  return {
    row,
    gradeDistribution: (["A", "B", "C", "D", "E", "F"] as LeadGrade[]).map((grade) => {
      const count = byGrade.find((g) => g.grade === grade)?._count._all ?? 0
      return { grade, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }
    }),
    stages: stages.map((s) => ({ name: s.name, count: stageCount.get(s.id) ?? 0, isTerminal: s.is_terminal })),
    sources: sources
      .map((s) => ({
        name: s.name,
        count: sourceCount.get(s.id) ?? 0,
        intentBaseline: s.intent_baseline,
        reliability: s.reliability_score,
      }))
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count),
    members: members.map((m) => ({
      id: m.user.id,
      name: `${m.user.first_name} ${m.user.last_name ?? ""}`.trim() || m.user.email,
      email: m.user.email,
      role: m.user.role,
      isActive: m.user.is_active,
    })),
  }
}
