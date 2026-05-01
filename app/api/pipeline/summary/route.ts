import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"

/**
 * GET /api/pipeline/summary
 *
 * Powers the Pipeline page header + bottom analytics row. Returns:
 *   1. kpis        — Total / Open / Won / Lost / Win-Rate, each with delta% (this vs last month) and 7-pt daily spark
 *   2. value_trend — last 30 days of summed won_value bucketed by won_at (₹)
 *   3. sources     — top 5 active lead sources this month with count + share%
 *   4. activities  — last 8 signals account-wide with lead name + label
 *
 * Scoped to the requester's account; admin and rep see the same shape (rep only sees their slice when assigned filters arrive — kept open here for v1).
 */

const SIGNAL_LABEL: Record<string, string> = {
  CALL_ANSWERED_INTERESTED:    "Lead picked up — interested",
  CALL_ANSWERED_NOT_INTERESTED:"Lead picked up — not interested",
  CALL_ANSWERED_CALLBACK:      "Lead asked for a callback",
  CALL_ANSWERED_WRONG_NUMBER:  "Wrong number on call",
  CALL_NOT_ANSWERED:           "Call not answered",
  CALL_BUSY:                   "Call busy",
  CALL_INVALID:                "Invalid number",
  CALL_VOICEMAIL:              "Reached voicemail",
  WA_REPLIED_1H:               "Replied on WhatsApp within 1h",
  WA_REPLIED_4H:               "Replied on WhatsApp within 4h",
  WA_REPLIED_24H:              "Replied on WhatsApp",
  WA_NO_REPLY:                 "No WhatsApp reply",
  WA_TAG_ASKED_PRICING:        "Asked pricing on WhatsApp",
  WA_TAG_BROCHURE:             "Asked for brochure",
  WA_TAG_NEGOTIATING:          "Negotiating on WhatsApp",
  WA_TAG_COMPARING:            "Comparing options",
  WA_TAG_DECISION_PENDING:     "Decision pending",
  WA_STAGE_ADVANCED:           "Stage advanced via WhatsApp",
  EMAIL_OPENED:                "Email opened",
  EMAIL_CLICKED:               "Email link clicked",
  IMPORT_HIGH_INTENT:          "Imported — high intent",
  IMPORT_MEDIUM_INTENT:        "Imported — medium intent",
  IMPORT_LOW_INTENT:           "Imported — low intent",
  IMPORT_RECENT_CONTACT:       "Imported — recent contact",
  IMPORT_WARM_CONTACT:         "Imported — warm contact",
  IMPORT_STALE_CONTACT:        "Imported — stale contact",
  IMPORT_ACTIVE_INTEREST:      "Imported — active interest noted",
  IMPORT_NEGATIVE_SIGNAL:      "Imported — negative signal",
  INQUIRY_HIGH_SPECIFICITY:    "High-specificity inquiry",
  INQUIRY_MED_SPECIFICITY:     "Medium-specificity inquiry",
  SOURCE_BASELINE:             "New lead added",
  RE_INQUIRY:                  "Re-inquired",
  REP_VERY_INTERESTED:         "Rep flagged: very interested",
  REP_NOT_INTERESTED:          "Rep flagged: not interested",
  STAGE_PROPOSAL_SENT:         "Proposal sent",
}

const SIGNAL_CATEGORY: Record<string, "call" | "whatsapp" | "import" | "system" | "email"> = {}
Object.keys(SIGNAL_LABEL).forEach((k) => {
  SIGNAL_CATEGORY[k] =
    k.startsWith("CALL_")     ? "call" :
    k.startsWith("WA_")       ? "whatsapp" :
    k.startsWith("EMAIL_")    ? "email" :
    k.startsWith("IMPORT_") || k.startsWith("INQUIRY_") || k === "SOURCE_BASELINE" || k === "RE_INQUIRY" ? "import" :
    "system"
})

const SOURCE_PALETTE = ["sky", "violet", "mint", "peach", "amber"] as const

function deltaPct(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100
  return Math.round(((curr - prev) / prev) * 1000) / 10
}

function startOfDay(d: Date): Date { const c = new Date(d); c.setHours(0, 0, 0, 0); return c }

export async function GET() {
  try {
    const session = await requireAuth()
    const accountId = session.account.id

    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    // Pull all the leads/signals we need in parallel
    const [allLeads, recentSignals, sources, stages] = await Promise.all([
      prisma.lead.findMany({
        where: { account_id: accountId },
        select: {
          id: true, created_at: true, won_at: true, lost_at: true, won_value: true,
          stage_id: true, source_id: true,
          first_name: true, last_name: true,
        },
      }),
      prisma.signal.findMany({
        where:   { account_id: accountId },
        orderBy: { created_at: "desc" },
        take:    8,
        select:  {
          id: true, signal_type: true, created_at: true,
          lead: { select: { id: true, first_name: true, last_name: true } },
        },
      }),
      prisma.leadSource.findMany({
        where: { account_id: accountId },
        select: { id: true, name: true, key: true },
      }),
      prisma.pipelineStage.findMany({
        where:  { account_id: accountId },
        select: { id: true, is_terminal: true, is_won: true, is_lost: true },
      }),
    ])

    const terminalIds = new Set(stages.filter((s) => s.is_terminal).map((s) => s.id))

    // ── KPIs ──────────────────────────────────────────────────────────────
    const inThisMonth = (d: Date | null) => !!d && d >= thisMonthStart
    const inLastMonth = (d: Date | null) => !!d && d >= lastMonthStart && d < thisMonthStart

    const totalThis = allLeads.filter((l) => inThisMonth(l.created_at)).length
    const totalLast = allLeads.filter((l) => inLastMonth(l.created_at)).length

    const openThis = allLeads.filter((l) => inThisMonth(l.created_at) && !terminalIds.has(l.stage_id)).length
    const openLast = allLeads.filter((l) => inLastMonth(l.created_at) && !terminalIds.has(l.stage_id)).length

    const wonThis  = allLeads.filter((l) => inThisMonth(l.won_at)).length
    const wonLast  = allLeads.filter((l) => inLastMonth(l.won_at)).length

    const lostThis = allLeads.filter((l) => inThisMonth(l.lost_at)).length
    const lostLast = allLeads.filter((l) => inLastMonth(l.lost_at)).length

    const winRateThis = wonThis + lostThis > 0 ? Math.round((wonThis / (wonThis + lostThis)) * 100) : 0
    const winRateLast = wonLast + lostLast > 0 ? Math.round((wonLast / (wonLast + lostLast)) * 100) : 0

    // 7-day sparklines
    const spark7 = (predicate: (l: typeof allLeads[number], dayStart: Date, dayEnd: Date) => boolean): number[] => {
      const out: number[] = []
      for (let i = 6; i >= 0; i--) {
        const dayStart = startOfDay(new Date(now.getTime() - i * 86_400_000))
        const dayEnd   = new Date(dayStart.getTime() + 86_400_000)
        out.push(allLeads.filter((l) => predicate(l, dayStart, dayEnd)).length)
      }
      return out
    }
    const sparkTotal = spark7((l, s, e) => !!l.created_at && l.created_at >= s && l.created_at < e)
    const sparkOpen  = spark7((l, s, e) => !!l.created_at && l.created_at >= s && l.created_at < e && !terminalIds.has(l.stage_id))
    const sparkWon   = spark7((l, s, e) => !!l.won_at  && l.won_at  >= s && l.won_at  < e)
    const sparkLost  = spark7((l, s, e) => !!l.lost_at && l.lost_at >= s && l.lost_at < e)
    const sparkWinRate = sparkWon.map((w, i) => {
      const denom = w + sparkLost[i]
      return denom > 0 ? Math.round((w / denom) * 100) : 0
    })

    // ── Value trend (last 30 days) ────────────────────────────────────────
    const valueTrend: { date: string; value: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const dayStart = startOfDay(new Date(now.getTime() - i * 86_400_000))
      const dayEnd   = new Date(dayStart.getTime() + 86_400_000)
      const value = allLeads.reduce((sum, l) => {
        if (l.won_at && l.won_at >= dayStart && l.won_at < dayEnd) return sum + (l.won_value ?? 0)
        return sum
      }, 0)
      valueTrend.push({ date: dayStart.toISOString().slice(0, 10), value })
    }

    // ── Sources (this month) ──────────────────────────────────────────────
    const sourceMap = new Map<string, string>()
    sources.forEach((s) => sourceMap.set(s.id, s.name))
    const sourceCounts = new Map<string, number>()
    allLeads.forEach((l) => {
      if (!inThisMonth(l.created_at)) return
      const name = sourceMap.get(l.source_id) ?? "Unknown"
      sourceCounts.set(name, (sourceCounts.get(name) ?? 0) + 1)
    })
    const totalSourceLeads = Array.from(sourceCounts.values()).reduce((a, b) => a + b, 0)
    const sourcesOut = Array.from(sourceCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count], i) => ({
        name,
        count,
        pct:   totalSourceLeads > 0 ? Math.round((count / totalSourceLeads) * 1000) / 10 : 0,
        color: SOURCE_PALETTE[i] ?? "ink",
      }))

    // ── Activities (last 8) ───────────────────────────────────────────────
    const activitiesOut = recentSignals.map((s) => ({
      id:        s.id,
      label:     SIGNAL_LABEL[s.signal_type] ?? s.signal_type.replace(/_/g, " ").toLowerCase(),
      lead_name: `${s.lead.first_name} ${s.lead.last_name ?? ""}`.trim(),
      lead_id:   s.lead.id,
      ts:        s.created_at.toISOString(),
      category:  SIGNAL_CATEGORY[s.signal_type] ?? "system",
    }))

    return apiSuccess({
      kpis: {
        total: { value: totalThis, delta_pct: deltaPct(totalThis, totalLast), spark: sparkTotal },
        open:  { value: openThis,  delta_pct: deltaPct(openThis,  openLast),  spark: sparkOpen  },
        won:   { value: wonThis,   delta_pct: deltaPct(wonThis,   wonLast),   spark: sparkWon   },
        lost:  { value: lostThis,  delta_pct: deltaPct(lostThis,  lostLast),  spark: sparkLost  },
        win_rate: { value: winRateThis, delta_pct: deltaPct(winRateThis, winRateLast), spark: sparkWinRate },
      },
      value_trend:  valueTrend,
      total_value:  valueTrend.reduce((a, b) => a + b.value, 0),
      sources:      sourcesOut,
      activities:   activitiesOut,
      window: {
        this_month_label: thisMonthStart.toLocaleString("en-IN", { month: "short", year: "numeric" }),
        last_month_label: lastMonthStart.toLocaleString("en-IN", { month: "short", year: "numeric" }),
      },
    })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    console.error("[/api/pipeline/summary] error:", err)
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
