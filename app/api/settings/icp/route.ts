import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { inngest } from "@/inngest/client"
import { requireAuth, requireRole } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"

// NOTE: per-account `weight_overrides` (signal-weight tuning) is deferred — it
// was never wired into the scoring engine and has no UI. The Account column
// remains for future use, but the API no longer accepts/returns it so we don't
// surface a non-functional feature (audit B6).
const IcpSchema = z.object({
  icp_industries:      z.array(z.string()).optional(),
  icp_states:          z.array(z.string()).optional(),
  icp_business_types:  z.array(z.string()).optional(),
  icp_roles:           z.array(z.string()).optional(),
  icp_budget_min:      z.number().int().min(0).nullable().optional(),
  icp_budget_max:      z.number().int().min(0).nullable().optional(),
  icp_sales_cycle:     z.enum(["SAME_DAY","THREE_DAYS","TWO_WEEKS","FOUR_WEEKS","THREE_MONTHS","OVER_THREE_MONTHS"]).optional(),
  icp_configured:      z.boolean().optional(),
  sql_fit_threshold:   z.number().int().min(0).max(100).optional(),
  sql_intent_threshold: z.number().int().min(0).max(100).optional(),
})

/**
 * GET /api/settings/icp
 * Returns the current ICP and SQL threshold config for the account.
 */
export async function GET(_req: Request) {
  try {
    const session = await requireAuth()

    const account = await prisma.account.findUnique({
      where: { id: session.account.id },
      select: {
        icp_configured:       true,
        icp_industries:       true,
        icp_states:           true,
        icp_business_types:   true,
        icp_roles:            true,
        icp_budget_min:       true,
        icp_budget_max:       true,
        icp_sales_cycle:      true,
        sql_fit_threshold:    true,
        sql_intent_threshold: true,
      },
    })

    return apiSuccess({ icp: account })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}

/**
 * PUT /api/settings/icp
 *
 * Updates ICP config, then fires the `account/icp.updated` Inngest event which
 * regrades every active lead through the scoring engine (fit depends on ICP).
 * Returns { queued: count } — the lead count that will be regraded async.
 *
 * Admin only.
 */
export async function PUT(req: Request) {
  try {
    const session = await requireRole("ADMIN")

    const _rl = await rateLimited(`settings:icp:${session.account.id}`, LIMITS.write)
    if (_rl) return _rl

    const { data, error } = await parseBody(req, IcpSchema)
    if (error) return error

    await prisma.account.update({
      where: { id: session.account.id },
      data: {
        ...(data.icp_industries      !== undefined ? { icp_industries:      data.icp_industries      } : {}),
        ...(data.icp_states          !== undefined ? { icp_states:          data.icp_states          } : {}),
        ...(data.icp_business_types  !== undefined ? { icp_business_types:  data.icp_business_types  } : {}),
        ...(data.icp_roles           !== undefined ? { icp_roles:           data.icp_roles           } : {}),
        ...(data.icp_budget_min      !== undefined ? { icp_budget_min:      data.icp_budget_min      } : {}),
        ...(data.icp_budget_max      !== undefined ? { icp_budget_max:      data.icp_budget_max      } : {}),
        ...(data.icp_sales_cycle     !== undefined ? { icp_sales_cycle:     data.icp_sales_cycle     } : {}),
        ...(data.icp_configured      !== undefined ? { icp_configured:      data.icp_configured      } : {}),
        ...(data.sql_fit_threshold   !== undefined ? { sql_fit_threshold:   data.sql_fit_threshold   } : {}),
        ...(data.sql_intent_threshold !== undefined ? { sql_intent_threshold: data.sql_intent_threshold } : {}),
      },
    })

    // Count active leads that the regrade will touch (for the banner).
    const activeLeadCount = await prisma.lead.count({
      where: { account_id: session.account.id, is_junk: false, won_at: null, lost_at: null },
    })

    // Fire the real async regrade (audit B7). Fit scores depend on the ICP, so a
    // change must re-run the scoring engine over every active lead. Guarded so a
    // missing/unreachable Inngest never fails the settings save — the nightly
    // decay run is the backstop.
    try {
      await inngest.send({
        name: "account/icp.updated",
        data: { account_id: session.account.id },
      })
    } catch (e) {
      console.warn("[icp] failed to enqueue regrade event:", String(e))
    }

    return apiSuccess({ queued: activeLeadCount, message: `Regrading ${activeLeadCount} leads…` })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
