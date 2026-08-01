import { prisma } from "@/lib/prisma"
import { requireWorkspace, handleAuthError } from "@/lib/auth/middleware"
import { apiSuccess, apiError } from "@/lib/api/response"
import { rateLimited, LIMITS } from "@/lib/rate-limit"
import { analyseIntake } from "@/lib/intake/analyse"
import { columnSignatureHash } from "@/lib/intake/session"
import { INTAKE_ENGINE_VERSION, MAPPING_VERSION, ANALYSIS_VERSION } from "@/lib/intake/version"
import { IntakeSource, IntakeState, type Prisma } from "@prisma/client"

// Reads the session cookie → always dynamic.
export const dynamic = "force-dynamic"

const MAX_SAMPLE = 2000
const SOURCES = new Set<string>(Object.values(IntakeSource))

/**
 * POST /api/import/analyse
 *
 * The "Analysing…" step. Profiles a parsed, column-mapped sample and returns the
 * Import Intelligence Report. Imports NOTHING — no lead is written. Opens an
 * intake_session (best-effort) so the report the customer sees is frozen and the
 * Time-to-Trust clock starts. Admin/Manager only.
 *
 * Body: { sample: Record<string,string>[], total_rows?, upload_source?, upload_started_at? }
 */
export async function POST(req: Request) {
  try {
    const session = await requireWorkspace("ADMIN", "MANAGER")

    const rl = await rateLimited(`intake:${session.user.id}`, LIMITS.write)
    if (rl) return rl

    const body = await req.json().catch(() => ({}))
    const rawSample = Array.isArray(body?.sample) ? body.sample : null
    if (!rawSample || rawSample.length === 0) return apiError("No rows to analyse", "BAD_REQUEST", 400)

    const sample = rawSample
      .filter((r: unknown): r is Record<string, string> => !!r && typeof r === "object" && !Array.isArray(r))
      .slice(0, MAX_SAMPLE)
    if (sample.length === 0) return apiError("No rows to analyse", "BAD_REQUEST", 400)

    const totalRows = Number.isFinite(body?.total_rows) ? Math.max(0, Math.floor(body.total_rows)) : sample.length

    const t0 = Date.now()
    const report = analyseIntake({ sample, totalRows })
    const analysisMs = Date.now() - t0

    const { columns, hash } = columnSignatureHash(sample)
    const source = typeof body?.upload_source === "string" && SOURCES.has(body.upload_source.toUpperCase())
      ? (body.upload_source.toUpperCase() as IntakeSource)
      : IntakeSource.CSV
    const uploadStartedAt = typeof body?.upload_started_at === "string" && !Number.isNaN(Date.parse(body.upload_started_at))
      ? new Date(body.upload_started_at)
      : undefined

    // Persist the session — frozen report + snapshot + TTT clock. Best-effort:
    // the customer's report must never be blocked by a telemetry write.
    let sessionId: string | null = null
    try {
      const created = await prisma.intakeSession.create({
        data: {
          account_id:               session.account.id,
          workspace_id:             session.workspace.id,
          user_id:                  session.user.id,
          upload_source:            source,
          rows:                     totalRows,
          columns,
          sample_hash:              hash,
          detected_country:         report.country.known ? "India" : null,
          detected_currency:        report.currency.known ? "INR" : null,
          detected_business_type:   report.businessType.known ? report.businessType.claim : null,
          mapping_version:          MAPPING_VERSION,
          analysis_version:         ANALYSIS_VERSION,
          engine_version:           INTAKE_ENGINE_VERSION,
          report:                   report as unknown as Prisma.InputJsonValue,
          import_intelligence_score: report.confidence.importIntelligenceScore,
          mapping_confidence:        report.confidence.mappingConfidence,
          contact_quality:           report.confidence.contactQuality,
          business_context:          report.confidence.businessContext,
          completeness:              report.confidence.dataCompleteness,
          ...(uploadStartedAt ? { upload_started_at: uploadStartedAt } : {}),
          analysis_finished_at:     new Date(),
          analysis_duration_ms:     analysisMs,
          state:                    IntakeState.REPORT_READY,
          events: {
            create: [
              { state: IntakeState.CREATED, note: source, ...(uploadStartedAt ? { at: uploadStartedAt } : {}) },
              { state: IntakeState.REPORT_READY },
            ],
          },
        },
        select: { id: true },
      })
      sessionId = created.id
    } catch {
      sessionId = null
    }

    return apiSuccess({ session_id: sessionId, report })
  } catch (err) {
    const authResponse = handleAuthError(err)
    if (authResponse) return authResponse
    return apiError("Internal server error", "INTERNAL_ERROR", 500)
  }
}
