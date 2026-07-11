import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireWorkspace } from "@/lib/auth/middleware"
import { handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError, parseBody } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import { processSignalAndUpdateScores } from "@/lib/scoring/orchestrator"
import { getNextAction } from "@/lib/scoring/next-action"
import { getLeadUsage } from "@/lib/billing/lead-usage"

const PAGE_SIZE = 100

// ─────────────────────────────────────────────
// GET /api/leads
// Filterable, paginated list (100/page)
// ─────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    const session = await requireWorkspace()
    const { searchParams } = new URL(req.url)

    const grade       = searchParams.get("grade") ?? undefined
    const stageId     = searchParams.get("stage") ?? undefined
    const sourceId    = searchParams.get("source") ?? undefined
    const repId       = searchParams.get("rep") ?? undefined
    const search      = searchParams.get("search") ?? undefined
    const importJobId = searchParams.get("batch") ?? undefined
    const dateFrom    = searchParams.get("date_from") ?? undefined
    const dateTo      = searchParams.get("date_to")   ?? undefined
    const page        = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
    const isJunk      = searchParams.get("junk") === "true"

    // REP can only see their own leads
    const assignedFilter =
      session.user.role === "REP"
        ? { assigned_rep_id: session.user.id }
        : repId
        ? { assigned_rep_id: repId }
        : {}

    const where = {
      account_id: session.account.id, workspace_id: session.workspace.id,
      ...assignedFilter,
      ...(grade       ? { grade: grade as "A" | "B" | "C" | "D" | "E" | "F" } : {}),
      ...(stageId     ? { stage_id: stageId }         : {}),
      ...(sourceId    ? { source_id: sourceId }        : {}),
      ...(importJobId ? { import_job_id: importJobId } : {}),
      ...(dateFrom || dateTo ? {
        imported_at: {
          ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
          ...(dateTo   ? { lte: new Date(dateTo + "T23:59:59.999Z") } : {}),
        },
      } : {}),
      is_junk: isJunk,
      ...(search
        ? {
            OR: [
              { first_name: { contains: search, mode: "insensitive" as const } },
              { last_name:  { contains: search, mode: "insensitive" as const } },
              { phone:      { contains: search } },
              { email:      { contains: search, mode: "insensitive" as const } },
              { company_name: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    }

    const [rawLeads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        // Sort by grade priority (A first), then most-recent within same grade
        orderBy: [{ grade: "asc" }, { imported_at: "desc" }],
        skip:  (page - 1) * PAGE_SIZE,
        take:  PAGE_SIZE,
        include: {
          source: { select: { id: true, name: true, key: true } },
          stage:  { select: { id: true, name: true, key: true } },
          assigned_rep: { select: { id: true, first_name: true, last_name: true } },
          // Most-recent signal — drives the "Last Activity" column
          signals: {
            select: { created_at: true, signal_type: true },
            orderBy: { created_at: "desc" },
            take: 1,
          },
        },
      }),
      prisma.lead.count({ where }),
    ])

    // Attach computed next action to each lead
    const leads = rawLeads.map((lead) => ({
      ...lead,
      next_action: getNextAction(lead.grade),
    }))

    return apiSuccess({ leads, total, page, pages: Math.ceil(total / PAGE_SIZE) })
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}

// ─────────────────────────────────────────────
// POST /api/leads
// Create a single lead and trigger initial scoring
// ─────────────────────────────────────────────

const CreateLeadSchema = z.object({
  first_name:     z.string().min(1),
  last_name:      z.string().optional(),
  phone:          z.string().min(10),
  phone_raw:      z.string().optional(),
  email:          z.string().email().optional().nullable(),
  company_name:   z.string().optional().nullable(),
  designation:    z.string().optional().nullable(),
  city:           z.string().optional().nullable(),
  state:          z.string().optional().nullable(),
  pincode:        z.string().optional().nullable(),
  source_id:      z.string().min(1),
  stage_id:       z.string().min(1),
  inquiry_text:   z.string().optional().nullable(),
  expected_value: z.number().int().positive().optional().nullable(),
  assigned_rep_id: z.string().optional().nullable(),
})

export async function POST(req: Request) {
  try {
    const session = await requireWorkspace()

    const limited = await rateLimited(`leads:create:${session.user.id}`, LIMITS.heavyWrite)
    if (limited) return limited

    // Monthly lead cap (Free 100 / Starter 5k / Growth 25k / Scale ∞).
    const usage = await getLeadUsage(session.account.id)
    if (usage.isOver) {
      return apiError(
        `You've reached your ${usage.planName} plan's limit of ${usage.limit?.toLocaleString("en-IN")} leads this month. Upgrade to add more.`,
        "LEAD_LIMIT_REACHED",
        403,
      )
    }

    const { data, error } = await parseBody(req, CreateLeadSchema)
    if (error) return error

    // Normalise phone — ensure +91 prefix
    const phone = normalisePhone(data.phone)

    // Check for duplicate phone within the workspace
    const existing = await prisma.lead.findFirst({
      where: { workspace_id: session.workspace.id, phone },
    })
    if (existing) {
      return apiError(`A lead with phone ${phone} already exists`, "DUPLICATE_PHONE", 409)
    }

    // Verify source + stage belong to this account
    const [source, stage] = await Promise.all([
      prisma.leadSource.findFirst({ where: { id: data.source_id, account_id: session.account.id, workspace_id: session.workspace.id } }),
      prisma.pipelineStage.findFirst({ where: { id: data.stage_id, account_id: session.account.id, workspace_id: session.workspace.id } }),
    ])
    if (!source) return apiError("Invalid source_id", "INVALID_SOURCE", 422)
    if (!stage)  return apiError("Invalid stage_id",  "INVALID_STAGE",  422)

    // Create lead + SOURCE_BASELINE signal in a transaction, then score
    const lead = await prisma.$transaction(async (tx) => {
      const newLead = await tx.lead.create({
        data: {
          account_id:      session.account.id,
          first_name:      data.first_name,
          last_name:       data.last_name,
          phone,
          phone_raw:       data.phone_raw ?? data.phone,
          email:           data.email,
          company_name:    data.company_name,
          designation:     data.designation,
          city:            data.city,
          state:           data.state,
          pincode:         data.pincode,
          source_id:       data.source_id,
          stage_id:        data.stage_id,
          inquiry_text:    data.inquiry_text,
          expected_value:  data.expected_value,
          assigned_rep_id: data.assigned_rep_id,
        },
      })

      // Write SOURCE_BASELINE signal at import time (intent starts at source baseline)
      await tx.signal.create({
        data: {
          account_id:           session.account.id,
          lead_id:              newLead.id,
          signal_type:          "SOURCE_BASELINE",
          signal_value:         source.intent_baseline,
          raw_value:            { source_key: source.key },
          lead_grade_at_signal: "E",
          intent_score_before:  0,
          intent_score_after:   source.intent_baseline,
        },
      })

      // Run full scoring pipeline
      await processSignalAndUpdateScores(newLead.id, session.account.id, tx)

      return tx.lead.findUniqueOrThrow({ where: { id: newLead.id } })
    })

    return apiSuccess(lead, 201)
  } catch (e) {
    return handleAuthError(e) ?? apiError("Internal server error", "SERVER_ERROR", 500)
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`
  if (digits.length === 10) return `+91${digits}`
  return `+${digits}`
}
