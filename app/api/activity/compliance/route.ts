import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { startOfIstMonth } from "@/lib/time/ist"
import { isWithinSla, complianceBand } from "@/lib/activity/sla"
import type { LeadGrade } from "@prisma/client"

/**
 * GET /api/activity/compliance
 *
 * The compliance lens of the Activity module (this-IST-month). For each rep:
 *   - response_compliance_pct — % of assigned leads contacted within their
 *     grade SLA (A≤24h, B≤48h, C≤7d, D≤30d).
 *   - followup_adherence_pct  — of resolved follow-ups, % completed on time
 *     (on_time vs late vs breached = OVERDUE/SKIPPED).
 *   - escalations             — total follow-up escalations.
 *   - band                    — overall compliant / at-risk / breached.
 * A REP sees only their own row; ADMIN/MANAGER see the whole team + roll-up.
 */

type RepRow = {
  rep_id: string
  name: string
  role: string
  leads_total: number
  contacted_within_sla: number
  never_contacted: number
  response_compliance_pct: number
  fu_on_time: number
  fu_late: number
  fu_breached: number
  followup_adherence_pct: number
  escalations: number
  compliance_pct: number
  band: ReturnType<typeof complianceBand>
}

export async function GET() {
  try {
    const session = await requireWorkspace()
    const accountId = session.account.id
    const workspaceId = session.workspace.id
    const isRep = session.user.role === "REP"
    const monthStart = startOfIstMonth()

    const reps = await prisma.user.findMany({
      where: {
        account_id: accountId,
        is_active: true,
        role: { in: ["REP", "MANAGER", "ADMIN"] },
        ...(isRep ? { id: session.user.id } : {}),
      },
      select: { id: true, first_name: true, last_name: true, role: true },
    })
    const repIds = reps.map((r) => r.id)

    const [leads, fups] = await Promise.all([
      prisma.lead.findMany({
        where: {
          account_id: accountId, workspace_id: workspaceId,
          assigned_rep_id: { in: repIds },
          imported_at: { gte: monthStart },
        },
        select: { assigned_rep_id: true, grade: true, speed_to_lead_hours: true },
      }),
      prisma.followUpAction.findMany({
        where: {
          account_id: accountId, workspace_id: workspaceId,
          assigned_rep_id: { in: repIds },
          due_date: { gte: monthStart },
        },
        select: { assigned_rep_id: true, status: true, completed_at: true, due_date: true, escalation_count: true },
      }),
    ])

    const rows: RepRow[] = reps.map((rep) => {
      const repLeads = leads.filter((l) => l.assigned_rep_id === rep.id)
      const within   = repLeads.filter((l) => isWithinSla(l.grade as LeadGrade, l.speed_to_lead_hours)).length
      const never    = repLeads.filter((l) => l.speed_to_lead_hours == null).length
      const respPct  = repLeads.length ? Math.round((within / repLeads.length) * 100) : 100

      const repFups  = fups.filter((f) => f.assigned_rep_id === rep.id)
      let onTime = 0, late = 0, breached = 0, escalations = 0
      for (const f of repFups) {
        escalations += f.escalation_count ?? 0
        if (f.status === "COMPLETED") {
          if (f.completed_at && f.completed_at <= f.due_date) onTime++
          else late++
        } else if (f.status === "OVERDUE" || f.status === "SKIPPED") {
          breached++
        }
        // PENDING (not yet due/resolved) is excluded from adherence
      }
      const resolved = onTime + late + breached
      const adhPct   = resolved ? Math.round((onTime / resolved) * 100) : 100

      // Overall = average of the two compliance dimensions.
      const compliancePct = Math.round((respPct + adhPct) / 2)

      return {
        rep_id: rep.id,
        name: [rep.first_name, rep.last_name].filter(Boolean).join(" ").trim() || "—",
        role: rep.role,
        leads_total: repLeads.length,
        contacted_within_sla: within,
        never_contacted: never,
        response_compliance_pct: respPct,
        fu_on_time: onTime,
        fu_late: late,
        fu_breached: breached,
        followup_adherence_pct: adhPct,
        escalations,
        compliance_pct: compliancePct,
        band: complianceBand(compliancePct),
      }
    })
    // Only surface reps who have data this period (keep the empty team tidy).
    .filter((r) => r.leads_total > 0 || r.fu_on_time + r.fu_late + r.fu_breached > 0 || r.escalations > 0)
    .sort((a, b) => b.compliance_pct - a.compliance_pct)

    // Account roll-up (weighted by counts, not a mean of means).
    const totLeads   = rows.reduce((s, r) => s + r.leads_total, 0)
    const totWithin  = rows.reduce((s, r) => s + r.contacted_within_sla, 0)
    const totOnTime  = rows.reduce((s, r) => s + r.fu_on_time, 0)
    const totResolved = rows.reduce((s, r) => s + r.fu_on_time + r.fu_late + r.fu_breached, 0)
    const acctResp = totLeads ? Math.round((totWithin / totLeads) * 100) : 100
    const acctAdh  = totResolved ? Math.round((totOnTime / totResolved) * 100) : 100
    const acctPct  = Math.round((acctResp + acctAdh) / 2)

    return apiSuccess({
      period_start: monthStart,
      account: {
        response_compliance_pct: acctResp,
        followup_adherence_pct: acctAdh,
        compliance_pct: acctPct,
        band: complianceBand(acctPct),
        escalations: rows.reduce((s, r) => s + r.escalations, 0),
        leads_total: totLeads,
      },
      reps: rows,
    })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    console.error("Activity compliance error:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
