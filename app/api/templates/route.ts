import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, requireRole } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"

const MAX_TEMPLATES = 20

const TemplateSchema = z.object({
  name:   z.string().min(1).max(100),
  type:   z.enum(["WHATSAPP", "CALL_SCRIPT"]),
  body:   z.string().min(1).max(2000),
  stages: z.array(z.string()).optional().default([]),
  grades: z.array(z.string()).optional().default([]),
})

/**
 * GET /api/templates
 * Returns all templates for this account.
 * Optional: ?type=WHATSAPP&stage=Negotiation for filtering.
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuth()
    const { searchParams } = new URL(req.url)
    const type  = searchParams.get("type")  ?? undefined
    const stage = searchParams.get("stage") ?? undefined

    const templates = await prisma.smartTemplate.findMany({
      where: {
        account_id: session.account.id,
        is_active:  true,
        ...(type  ? { type: type as "WHATSAPP" | "CALL_SCRIPT" } : {}),
        ...(stage ? { stages: { has: stage } } : {}),
      },
      orderBy: [{ usage_count: "desc" }, { name: "asc" }],
    })

    return apiSuccess({ templates })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}

/**
 * POST /api/templates
 * Create a new template. Max 20 per account.
 * Admin/Manager only.
 */
export async function POST(req: Request) {
  try {
    const session = await requireRole("ADMIN", "MANAGER")

    const { data, error } = await parseBody(req, TemplateSchema)
    if (error) return error

    const count = await prisma.smartTemplate.count({
      where: { account_id: session.account.id, is_active: true },
    })
    if (count >= MAX_TEMPLATES) {
      return apiError(`Maximum ${MAX_TEMPLATES} templates per account`, "LIMIT_REACHED", 422)
    }

    const template = await prisma.smartTemplate.create({
      data: {
        account_id: session.account.id,
        name:       data.name,
        type:       data.type,
        body:       data.body,
        stages:     data.stages,
        grades:     data.grades as ("A" | "B" | "C" | "D" | "E" | "F")[],
        is_active:  true,
        usage_count: 0,
      },
    })

    return apiSuccess({ template }, 201)
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
