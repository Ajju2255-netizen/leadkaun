import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth, requireRole, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody, NOT_FOUND } from "@/lib/api/response"

type Params = { params: { id: string } }

// ─────────────────────────────────────────────
// GET /api/leads/[id]
// Full lead record with signals, notes, follow-ups, stage history
// ─────────────────────────────────────────────

export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await requireAuth()

    const lead = await prisma.lead.findFirst({
      where: {
        id:         params.id,
        account_id: session.account.id,
        // REP can only view their assigned leads
        ...(session.user.role === "REP"
          ? { assigned_rep_id: session.user.id }
          : {}),
      },
      include: {
        source:       { select: { id: true, name: true, key: true, intent_baseline: true } },
        stage:        { select: { id: true, name: true, key: true, is_terminal: true, is_won: true, is_lost: true } },
        assigned_rep: { select: { id: true, first_name: true, last_name: true, email: true } },
        signals: {
          orderBy: { created_at: "desc" },
          take: 50,
        },
        notes: {
          orderBy: { created_at: "desc" },
          include: { user: { select: { id: true, first_name: true, last_name: true } } },
        },
        follow_up_actions: {
          where:   { status: { in: ["PENDING", "OVERDUE"] } },
          orderBy: { due_date: "asc" },
        },
        stage_history: {
          orderBy: { created_at: "desc" },
          take: 20,
        },
      },
    })

    if (!lead) return NOT_FOUND("Lead")
    return apiSuccess(lead)
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}

// ─────────────────────────────────────────────
// PATCH /api/leads/[id]
// Update editable fields on a lead
// ─────────────────────────────────────────────

const UpdateLeadSchema = z.object({
  first_name:      z.string().min(1).optional(),
  last_name:       z.string().optional().nullable(),
  email:           z.string().email().optional().nullable(),
  company_name:    z.string().optional().nullable(),
  designation:     z.string().optional().nullable(),
  city:            z.string().optional().nullable(),
  state:           z.string().optional().nullable(),
  pincode:         z.string().optional().nullable(),
  inquiry_text:    z.string().optional().nullable(),
  expected_value:  z.number().int().positive().optional().nullable(),
  custom_values:   z.record(z.string(), z.unknown()).optional(),
})

export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await requireAuth()
    const { data, error } = await parseBody(req, UpdateLeadSchema)
    if (error) return error

    const lead = await prisma.lead.findFirst({
      where: {
        id:         params.id,
        account_id: session.account.id,
        ...(session.user.role === "REP"
          ? { assigned_rep_id: session.user.id }
          : {}),
      },
    })
    if (!lead) return NOT_FOUND("Lead")

    const { custom_values, ...rest } = data
    const updated = await prisma.lead.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(custom_values !== undefined ? { custom_values: custom_values as object } : {}),
      },
    })

    return apiSuccess(updated)
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}

// ─────────────────────────────────────────────
// DELETE /api/leads/[id]
// Admin only
// ─────────────────────────────────────────────

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const session = await requireRole("ADMIN")

    const lead = await prisma.lead.findFirst({
      where: { id: params.id, account_id: session.account.id },
    })
    if (!lead) return NOT_FOUND("Lead")

    await prisma.lead.delete({ where: { id: params.id } })
    return apiSuccess({ deleted: true })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}
