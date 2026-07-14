import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { startOfIstMonth } from "@/lib/time/ist"

// Reads the session cookie, so this route is always dynamic — opt out of
// static prerender (silences Next's DYNAMIC_SERVER_USAGE build log).
export const dynamic = "force-dynamic"

/**
 * GET /api/analytics/dashboard-pulse
 *
 * Powers the redesigned Dashboard page. Returns 6 sections:
 *   1. kpis            — 5 KPIs with vs-last-month % deltas
 *   2. funnel          — pipeline stages with counts + %-of-entered
 *   3. top_reps        — leaderboard (revenue this month + conversion + delta)
 *   4. sources         — top lead sources with status pill
 *   5. recent_activity — last 8 signal events with formatted labels
 *   6. behaviour_health— donut bands (healthy / at-risk / missed / cold)
 *
 * Admin/Manager only. Time bucket is THIS calendar month vs LAST.
 */

const SIGNAL_LABELS: Record<string, { label: string; category: "call" | "whatsapp" | "import" | "system" | "email" }> = {
  CALL_ANSWERED_INTERESTED:    { label: "Lead picked up — interested",      category: "call" },
  CALL_ANSWERED_NOT_INTERESTED:{ label: "Lead picked up — not interested",  category: "call" },
  CALL_ANSWERED_CALLBACK:      { label: "Lead asked for a callback",        category: "call" },
  CALL_ANSWERED_WRONG_NUMBER:  { label: "Wrong number on call",             category: "call" },
  CALL_NOT_ANSWERED:           { label: "Call not answered",                category: "call" },
  CALL_BUSY:                   { label: "Call busy",                        category: "call" },
  CALL_INVALID:                { label: "Invalid number",                   category: "call" },
  CALL_VOICEMAIL:              { label: "Reached voicemail",                category: "call" },
  WA_REPLIED_1H:               { label: "Replied on WhatsApp within 1h",    category: "whatsapp" },
  WA_REPLIED_4H:               { label: "Replied on WhatsApp within 4h",    category: "whatsapp" },
  WA_REPLIED_24H:              { label: "Replied on WhatsApp",              category: "whatsapp" },
  WA_NO_REPLY:                 { label: "No WhatsApp reply",                category: "whatsapp" },
  WA_TAG_ASKED_PRICING:        { label: "Asked pricing on WhatsApp",        category: "whatsapp" },
  WA_TAG_BROCHURE:             { label: "Asked for brochure",               category: "whatsapp" },
  WA_TAG_NEGOTIATING:          { label: "Negotiating on WhatsApp",          category: "whatsapp" },
  WA_TAG_COMPARING:            { label: "Comparing options",                category: "whatsapp" },
  WA_TAG_DECISION_PENDING:     { label: "Decision pending",                 category: "whatsapp" },
  WA_TAG_NOT_SERIOUS:          { label: "Not a serious buyer",              category: "whatsapp" },
  WA_STAGE_ADVANCED:           { label: "Stage advanced via WhatsApp",      category: "whatsapp" },
  EMAIL_OPENED:                { label: "Email opened",                     category: "email" },
  EMAIL_CLICKED:               { label: "Email link clicked",               category: "email" },
  IMPORT_HIGH_INTENT:          { label: "Imported — high intent",           category: "import" },
  IMPORT_MEDIUM_INTENT:        { label: "Imported — medium intent",         category: "import" },
  IMPORT_LOW_INTENT:           { label: "Imported — low intent",            category: "import" },
  IMPORT_RECENT_CONTACT:       { label: "Imported — recent contact",        category: "import" },
  IMPORT_WARM_CONTACT:         { label: "Imported — warm contact",          category: "import" },
  IMPORT_STALE_CONTACT:        { label: "Imported — stale contact",         category: "import" },
  IMPORT_ACTIVE_INTEREST:      { label: "Imported — active interest noted", category: "import" },
  IMPORT_NEGATIVE_SIGNAL:      { label: "Imported — negative signal",       category: "import" },
  INQUIRY_HIGH_SPECIFICITY:    { label: "High-specificity inquiry",         category: "import" },
  INQUIRY_MED_SPECIFICITY:     { label: "Medium-specificity inquiry",       category: "import" },
  SOURCE_BASELINE:             { label: "New lead added",                   category: "import" },
  INQUIRY_EVENING_WEEKEND:     { label: "After-hours inquiry",              category: "import" },
  RE_INQUIRY:                  { label: "Re-inquired",                      category: "import" },
  REP_VERY_INTERESTED:         { label: "Rep flagged: very interested",     category: "system" },
  REP_NOT_INTERESTED:          { label: "Rep flagged: not interested",      category: "system" },
  INTENT_DECAY:                { label: "Intent decayed (no activity)",     category: "system" },
  STAGE_PROPOSAL_SENT:         { label: "Proposal sent",                    category: "system" },
}

export async function GET() {
  try {
    const session   = await requireWorkspace("ADMIN", "MANAGER")
    const accountId = session.account.id
    const workspaceId = session.workspace.id

    const now            = new Date()
    // IST calendar-month boundaries so "this month" matches Rep Tracking
    // (and every other screen) instead of drifting by the UTC offset.
    const monthStart     = startOfIstMonth(now)
    const lastMonthStart = startOfIstMonth(new Date(monthStart.getTime() - 1))
    const lastMonthEnd   = monthStart
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 3_600_000)

    // ── Aggregations in parallel ────────────────────────────────────────────
    const [
      newLeadsThis,    newLeadsLast,
      firstContactThis, firstContactLast,
      fuDoneThis,       fuDoneLast,
      winsThis,         winsLast,
      revenueThis,      revenueLast,
      stageBreakdown,
      reps,
      sources,
      recentSignals,
      behaviourCounts,
    ] = await Promise.all([
      prisma.lead.count({ where: { account_id: accountId, workspace_id: workspaceId, created_at: { gte: monthStart } } }),
      prisma.lead.count({ where: { account_id: accountId, workspace_id: workspaceId, created_at: { gte: lastMonthStart, lt: lastMonthEnd } } }),

      prisma.lead.count({ where: { account_id: accountId, workspace_id: workspaceId, first_contact_at: { gte: monthStart } } }),
      prisma.lead.count({ where: { account_id: accountId, workspace_id: workspaceId, first_contact_at: { gte: lastMonthStart, lt: lastMonthEnd } } }),

      prisma.followUpAction.count({ where: { account_id: accountId, workspace_id: workspaceId, status: "COMPLETED", completed_at: { gte: monthStart } } }),
      prisma.followUpAction.count({ where: { account_id: accountId, workspace_id: workspaceId, status: "COMPLETED", completed_at: { gte: lastMonthStart, lt: lastMonthEnd } } }),

      prisma.lead.count({ where: { account_id: accountId, workspace_id: workspaceId, won_at: { gte: monthStart } } }),
      prisma.lead.count({ where: { account_id: accountId, workspace_id: workspaceId, won_at: { gte: lastMonthStart, lt: lastMonthEnd } } }),

      prisma.lead.aggregate({
        where: { account_id: accountId, workspace_id: workspaceId, won_at: { gte: monthStart } },
        _sum:  { won_value: true },
      }),
      prisma.lead.aggregate({
        where: { account_id: accountId, workspace_id: workspaceId, won_at: { gte: lastMonthStart, lt: lastMonthEnd } },
        _sum:  { won_value: true },
      }),

      // Pipeline funnel — non-terminal stages, with lead counts
      prisma.pipelineStage.findMany({
        where:   { account_id: accountId, workspace_id: workspaceId },
        select:  {
          name: true, key: true, display_order: true, is_won: true, is_lost: true,
          leads: {
            where:  { account_id: accountId, workspace_id: workspaceId, is_junk: false },
            select: { id: true, won_at: true, lost_at: true },
          },
        },
        orderBy: { display_order: "asc" },
      }),

      // Reps with this-month wins for leaderboard
      prisma.user.findMany({
        where:   { account_id: accountId, is_active: true, role: { in: ["REP", "MANAGER", "ADMIN"] } },
        select:  {
          id: true, first_name: true, last_name: true,
          assigned_leads: {
            where:  { account_id: accountId, workspace_id: workspaceId, won_at: { gte: monthStart } },
            select: { won_value: true },
          },
        },
      }),

      // Lead sources with recent activity
      prisma.leadSource.findMany({
        where:  { account_id: accountId, workspace_id: workspaceId },
        select: {
          id: true, name: true,
          leads: {
            where:  { account_id: accountId, workspace_id: workspaceId, is_junk: false },
            select: { id: true, created_at: true, won_at: true },
          },
        },
      }),

      // Recent activity — last 8 signals across the account
      prisma.signal.findMany({
        where:   { account_id: accountId, workspace_id: workspaceId },
        orderBy: { created_at: "desc" },
        take:    8,
        select:  {
          id: true, signal_type: true, created_at: true,
          lead: { select: { id: true, first_name: true, last_name: true, company_name: true } },
          user: { select: { first_name: true, last_name: true } },
        },
      }),

      // Behaviour health — counts for donut bands (active leads only)
      prisma.lead.findMany({
        where:  { account_id: accountId, workspace_id: workspaceId, is_junk: false, won_at: null, lost_at: null },
        select: {
          is_missed:        true,
          first_contact_at: true,
          stage_entered_at: true,
        },
      }),
    ])

    // ── KPI deltas ──────────────────────────────────────────────────────────
    const pctChange = (now: number, prev: number): number | null => {
      if (prev === 0) return now > 0 ? 100 : null
      return Math.round(((now - prev) / prev) * 100)
    }
    const revThis = revenueThis._sum.won_value ?? 0
    const revLast = revenueLast._sum.won_value ?? 0

    const kpis = {
      new_leads:        { value: newLeadsThis,    pct_change: pctChange(newLeadsThis,    newLeadsLast) },
      first_contacts:   { value: firstContactThis,pct_change: pctChange(firstContactThis,firstContactLast) },
      followups_done:   { value: fuDoneThis,      pct_change: pctChange(fuDoneThis,      fuDoneLast) },
      wins:             { value: winsThis,        pct_change: pctChange(winsThis,        winsLast) },
      revenue:          { value: revThis,         pct_change: pctChange(revThis,         revLast) },
    }

    // ── Funnel ─────────────────────────────────────────────────────────────
    // Show entered → in-flight stages → won.  Skip "Lost".
    const wonStage   = stageBreakdown.find((s) => s.is_won)
    const inFlight   = stageBreakdown.filter((s) => !s.is_won && !s.is_lost)
    const totalEntered = inFlight.reduce((s, st) => s + st.leads.length, 0) + (wonStage?.leads.length ?? 0)
    const funnelStages: { name: string; key: string; count: number; pct: number }[] = []
    for (const st of inFlight) {
      const c = st.leads.length
      funnelStages.push({
        name: st.name,
        key:  st.key,
        count: c,
        pct:  totalEntered > 0 ? Math.round((c / totalEntered) * 100) : 0,
      })
    }
    if (wonStage) {
      const c = wonStage.leads.length
      funnelStages.push({
        name: wonStage.name,
        key:  wonStage.key,
        count: c,
        pct:  totalEntered > 0 ? Math.round((c / totalEntered) * 100) : 0,
      })
    }
    const conversionPct = totalEntered > 0 && wonStage
      ? Math.round(((wonStage.leads.length) / totalEntered) * 100)
      : 0

    // ── Top reps leaderboard (revenue this month) ───────────────────────────
    const repBoard = reps
      .map((r) => {
        const rev = r.assigned_leads.reduce((s, l) => s + (l.won_value ?? 0), 0)
        return {
          id:               r.id,
          first_name:       r.first_name,
          last_name:        r.last_name,
          revenue:          rev,
          wins:             r.assigned_leads.length,
        }
      })
      .filter((r) => r.revenue > 0 || r.wins > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    // ── Sources status ──────────────────────────────────────────────────────
    const sevenDaysAgo  = new Date(Date.now() - 7  * 24 * 3_600_000)
    const fourteenAgo   = fourteenDaysAgo
    const srcSummary = sources
      .map((s) => {
        const total      = s.leads.length
        const recent7    = s.leads.filter((l) => l.created_at >= sevenDaysAgo).length
        const recent14   = s.leads.filter((l) => l.created_at >= fourteenAgo).length
        let status: "active" | "slowing" | "cold"
        if (recent7 === 0 && total > 0) status = "cold"
        else if (recent7 < recent14 - recent7) status = "slowing"
        else status = "active"
        return { id: s.id, name: s.name, total_leads: total, recent_7d: recent7, status }
      })
      .filter((s) => s.total_leads > 0)
      .sort((a, b) => b.total_leads - a.total_leads)
      .slice(0, 5)

    // ── Recent activity ─────────────────────────────────────────────────────
    const activity = recentSignals.map((sig) => {
      const meta = SIGNAL_LABELS[sig.signal_type] ?? { label: sig.signal_type.replace(/_/g, " "), category: "system" as const }
      const leadName = [sig.lead.first_name, sig.lead.last_name].filter(Boolean).join(" ")
      return {
        id:         sig.id,
        category:   meta.category,
        title:      meta.label,
        lead_id:    sig.lead.id,
        lead_name:  leadName,
        company:    sig.lead.company_name,
        rep_name:   sig.user ? [sig.user.first_name, sig.user.last_name].filter(Boolean).join(" ") : null,
        created_at: sig.created_at.toISOString(),
      }
    })

    // ── Behaviour health donut ──────────────────────────────────────────────
    let healthy = 0, atRisk = 0, missed = 0, cold = 0
    for (const l of behaviourCounts) {
      if (l.is_missed) missed++
      else if (!l.first_contact_at) cold++
      else if (l.stage_entered_at < fourteenDaysAgo) atRisk++
      else healthy++
    }
    const totalActive = behaviourCounts.length
    const pct = (n: number) => totalActive > 0 ? Math.round((n / totalActive) * 100) : 0
    const behaviour = {
      total:       totalActive,
      healthy:     { count: healthy, pct: pct(healthy) },
      at_risk:     { count: atRisk,  pct: pct(atRisk)  },
      missed:      { count: missed,  pct: pct(missed)  },
      cold:        { count: cold,    pct: pct(cold)    },
      headline_pct: pct(healthy),  // shown in the donut centre
    }

    return apiSuccess({
      kpis,
      funnel: {
        stages:         funnelStages,
        total_entered:  totalEntered,
        conversion_pct: conversionPct,
        goal_pct:       15,        // default goal — shown in callout
      },
      top_reps:         repBoard,
      sources:          srcSummary,
      recent_activity:  activity,
      behaviour_health: behaviour,
    })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
