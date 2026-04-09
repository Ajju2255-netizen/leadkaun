import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

/**
 * GET /api/notifications
 *
 * Synthesises a notification feed from real DB events (last 7 days):
 *  - SQL threshold crossings (is_sql = true leads, ordered by updated_at)
 *  - Grade drops (signals of type GRADE_DROP or sudden grade regression)
 *  - Overdue follow-up actions
 *  - Completed imports
 *
 * No separate notifications table — derived from existing data.
 */
export async function GET(_req: Request) {
  try {
    const session   = await requireAuth()
    const accountId = session.account.id
    const isManager = session.user.role === "ADMIN" || session.user.role === "MANAGER"
    const since     = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const [sqlLeads, gradeDrop, overdueActions, imports] = await Promise.all([
      // SQL crossings: leads that became SQL in the last 7 days
      prisma.lead.findMany({
        where: {
          account_id: accountId,
          is_sql:     true,
          updated_at: { gte: since },
          ...(isManager ? {} : { assigned_rep_id: session.user.id }),
        },
        select: {
          id: true, first_name: true, last_name: true,
          grade: true, expected_value: true, updated_at: true,
          company_name: true,
        },
        orderBy: { updated_at: "desc" },
        take: 20,
      }),
      // Grade-drop signals from the last 7 days
      prisma.signal.findMany({
        where: {
          account_id:  accountId,
          signal_type: "INTENT_DECAY",
          created_at:  { gte: since },
          lead: isManager ? {} : { assigned_rep_id: session.user.id },
        },
        select: {
          id: true, created_at: true, signal_value: true,
          lead: {
            select: {
              id: true, first_name: true, last_name: true,
              grade: true, expected_value: true, company_name: true,
            },
          },
        },
        orderBy: { created_at: "desc" },
        take: 15,
      }),
      // Overdue follow-up actions
      prisma.followUpAction.findMany({
        where: {
          account_id:      accountId,
          status:          "OVERDUE",
          due_date:        { gte: since },
          assigned_rep_id: isManager ? undefined : session.user.id,
        },
        select: {
          id: true, due_date: true, action_type: true,
          lead: {
            select: {
              id: true, first_name: true, last_name: true,
              grade: true, expected_value: true,
            },
          },
        },
        orderBy: { due_date: "desc" },
        take: 10,
      }),
      // Recent completed imports
      prisma.importJobStatus.findMany({
        where: {
          account_id:   accountId,
          status:       "COMPLETE",
          completed_at: { gte: since },
        },
        select: {
          id: true, total_rows: true, inserted: true,
          errors: true, completed_at: true,
        },
        orderBy: { completed_at: "desc" },
        take: 5,
      }),
    ])

    type NotificationItem = {
      id:          string
      type:        string
      title:       string
      description: string
      lead_id:     string | null
      lead_name:   string | null
      grade:       string | null
      value:       number | null
      created_at:  string
    }

    const items: NotificationItem[] = []

    for (const lead of sqlLeads) {
      items.push({
        id:          `sql-${lead.id}`,
        type:        "SQL_CROSSED",
        title:       `${lead.first_name} ${lead.last_name ?? ""} crossed SQL threshold`,
        description: lead.company_name ?? `Grade ${lead.grade} lead`,
        lead_id:     lead.id,
        lead_name:   `${lead.first_name} ${lead.last_name ?? ""}`.trim(),
        grade:       lead.grade,
        value:       lead.expected_value,
        created_at:  lead.updated_at.toISOString(),
      })
    }

    for (const sig of gradeDrop) {
      if (!sig.lead) continue
      items.push({
        id:          `decay-${sig.id}`,
        type:        "GRADE_DROP",
        title:       `Intent score dropped for ${sig.lead.first_name} ${sig.lead.last_name ?? ""}`,
        description: `Signal value: ${sig.signal_value} · ${sig.lead.company_name ?? `Grade ${sig.lead.grade}`}`,
        lead_id:     sig.lead.id,
        lead_name:   `${sig.lead.first_name} ${sig.lead.last_name ?? ""}`.trim(),
        grade:       sig.lead.grade,
        value:       sig.lead.expected_value,
        created_at:  sig.created_at.toISOString(),
      })
    }

    for (const action of overdueActions) {
      if (!action.lead) continue
      items.push({
        id:          `overdue-${action.id}`,
        type:        "FOLLOW_UP_OVERDUE",
        title:       `Overdue ${action.action_type.toLowerCase()} with ${action.lead.first_name} ${action.lead.last_name ?? ""}`,
        description: `Due ${new Date(action.due_date).toLocaleDateString("en-IN")}`,
        lead_id:     action.lead.id,
        lead_name:   `${action.lead.first_name} ${action.lead.last_name ?? ""}`.trim(),
        grade:       action.lead.grade,
        value:       action.lead.expected_value,
        created_at:  action.due_date.toISOString(),
      })
    }

    for (const imp of imports) {
      items.push({
        id:          `import-${imp.id}`,
        type:        "IMPORT_COMPLETE",
        title:       `Import completed — ${imp.inserted} leads added`,
        description: imp.errors > 0
          ? `${imp.errors} rows skipped · ${imp.total_rows} total`
          : `${imp.total_rows} rows processed`,
        lead_id:     null,
        lead_name:   null,
        grade:       null,
        value:       null,
        created_at:  (imp.completed_at ?? new Date()).toISOString(),
      })
    }

    // Sort all by created_at desc
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return apiSuccess({ items: items.slice(0, 50) })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
