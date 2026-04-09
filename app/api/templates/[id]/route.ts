import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, requireRole } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"

const UpdateSchema = z.object({
  name:   z.string().min(1).max(100).optional(),
  body:   z.string().min(1).max(2000).optional(),
  stages: z.array(z.string()).optional(),
  grades: z.array(z.string()).optional(),
})

/** PATCH /api/templates/[id] — Update a template. Admin/Manager only. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireRole("ADMIN", "MANAGER")
    const { id }  = await params

    const tmpl = await prisma.smartTemplate.findFirst({
      where: { id, account_id: session.account.id },
    })
    if (!tmpl) return apiError("Template not found", "NOT_FOUND", 404)

    const { data, error } = await parseBody(req, UpdateSchema)
    if (error) return error

    const updated = await prisma.smartTemplate.update({
      where: { id },
      data: {
        ...(data.name   !== undefined ? { name:   data.name   } : {}),
        ...(data.body   !== undefined ? { body:   data.body   } : {}),
        ...(data.stages !== undefined ? { stages: data.stages } : {}),
        ...(data.grades !== undefined ? { grades: data.grades as ("A" | "B" | "C" | "D" | "E" | "F")[] } : {}),
      },
    })

    return apiSuccess({ template: updated })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}

/** DELETE /api/templates/[id] — Soft-delete a template. Admin/Manager only. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireRole("ADMIN", "MANAGER")
    const { id }  = await params

    const tmpl = await prisma.smartTemplate.findFirst({
      where: { id, account_id: session.account.id },
    })
    if (!tmpl) return apiError("Template not found", "NOT_FOUND", 404)

    await prisma.smartTemplate.update({ where: { id }, data: { is_active: false } })

    return apiSuccess({ deleted: true })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}

/** POST /api/templates/[id]/use — Increment usage_count. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth()
    const { id }  = await params

    const tmpl = await prisma.smartTemplate.findFirst({
      where: { id, account_id: session.account.id },
    })
    if (!tmpl) return apiError("Template not found", "NOT_FOUND", 404)

    await prisma.smartTemplate.update({
      where: { id },
      data:  { usage_count: { increment: 1 } },
    })

    return apiSuccess({ used: true })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
