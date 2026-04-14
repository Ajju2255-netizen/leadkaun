import { prisma } from "@/lib/prisma"
import { requireAuth, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { inferIndustry } from "@/lib/import/enrich-lead"

/**
 * GET /api/settings/icp/suggestions
 *
 * Analyzes the account's lead data (up to 500 most recent non-junk leads)
 * and returns:
 *   - top industries inferred from company names
 *   - top states from lead.state
 *   - top roles normalized from designation
 *   - win counts per segment (from won leads)
 *
 * Used by the ICP settings page to suggest ICP values based on what's
 * actually in the account's pipeline — no manual research needed.
 */
export async function GET() {
  try {
    const session = await requireAuth()

    const leads = await prisma.lead.findMany({
      where:   { account_id: session.account.id, is_junk: false },
      orderBy: { imported_at: "desc" },
      take:    500,
      select: {
        company_name: true,
        state:        true,
        designation:  true,
        won_at:       true,
        won_value:    true,
      },
    })

    const industryCounts = new Map<string, { total: number; won: number; won_value: number }>()
    const stateCounts    = new Map<string, { total: number; won: number; won_value: number }>()
    const roleCounts     = new Map<string, { total: number; won: number }>()

    for (const lead of leads) {
      const isWon   = !!lead.won_at
      const wonVal  = lead.won_value ?? 0

      const industry = inferIndustry(lead.company_name)
      if (industry) {
        const e = industryCounts.get(industry) ?? { total: 0, won: 0, won_value: 0 }
        industryCounts.set(industry, { total: e.total + 1, won: e.won + (isWon ? 1 : 0), won_value: e.won_value + (isWon ? wonVal : 0) })
      }

      if (lead.state) {
        const e = stateCounts.get(lead.state) ?? { total: 0, won: 0, won_value: 0 }
        stateCounts.set(lead.state, { total: e.total + 1, won: e.won + (isWon ? 1 : 0), won_value: e.won_value + (isWon ? wonVal : 0) })
      }

      if (lead.designation) {
        const normalized = normalizeRole(lead.designation)
        if (normalized) {
          const e = roleCounts.get(normalized) ?? { total: 0, won: 0 }
          roleCounts.set(normalized, { total: e.total + 1, won: e.won + (isWon ? 1 : 0) })
        }
      }
    }

    const industries = toSortedArray(industryCounts).slice(0, 8)
    const states     = toSortedArray(stateCounts).slice(0, 8)
    const roles      = toSortedArray(roleCounts).slice(0, 6)

    const hasWonLeads = leads.some((l) => !!l.won_at)

    return apiSuccess({
      industries,
      states,
      roles,
      has_won_leads:  hasWonLeads,
      total_analyzed: leads.length,
    })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function toSortedArray<T extends { total: number }>(map: Map<string, T>) {
  return Array.from(map.entries())
    .map(([value, stats]) => ({ value, ...stats }))
    .sort((a, b) => b.total - a.total)
}

const ROLE_KEYWORDS: { label: string; keywords: string[] }[] = [
  { label: "Owner / Founder",     keywords: ["owner", "founder", "proprietor", "partner"] },
  { label: "CEO / MD",            keywords: ["ceo", "md", "managing director", "chief executive"] },
  { label: "Sales Head",          keywords: ["sales", "business development", "bd head"] },
  { label: "Marketing Manager",   keywords: ["marketing"] },
  { label: "Purchase Manager",    keywords: ["purchase", "procurement", "buying"] },
  { label: "HR Manager",          keywords: ["hr", "human resource", "people"] },
  { label: "Operations Head",     keywords: ["operations", "ops head"] },
  { label: "IT Manager",          keywords: ["it manager", "it head", "cto", "technology"] },
]

function normalizeRole(designation: string): string | null {
  const d = designation.toLowerCase()
  for (const { label, keywords } of ROLE_KEYWORDS) {
    if (keywords.some((k) => d.includes(k))) return label
  }
  return null
}
