import { inngest } from "@/inngest/client"
import { recordJobRun } from "@/lib/events/job-run"
import { prisma } from "@/lib/prisma"
import { computeIntentScore } from "@/lib/scoring/intent-score"
import { assignGrade, checkSqlThreshold } from "@/lib/scoring/grade"
import { sendGradeDropEmail } from "@/lib/email/lead-alerts"
import type { SignalRecord } from "@/lib/scoring/types"
import type { LeadGrade } from "@prisma/client"

const BATCH_SIZE = 200

// Higher = better grade; a "drop" is new rank < old rank.
const GRADE_RANK: Record<LeadGrade, number> = { A: 6, B: 5, C: 4, D: 3, E: 2, F: 1 }
const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * Nightly intent decay job.
 * Cron: 20:30 UTC = 02:00 AM IST
 *
 * For every active (non-terminal, non-junk) lead across all accounts:
 * 1. Recompute intent score with decay applied
 * 2. If score changed → update lead + write INTENT_DECAY signal
 * 3. If grade changed → update grade_changed_at, log grade drop
 *
 * TAD ref: Section 6.2
 */
export const intentDecayFn = inngest.createFunction(
  { id: "intent-decay", name: "Nightly Intent Decay", triggers: [{ cron: "30 20 * * *" }] },
  async ({ step, logger }) => {
    await step.run("record-job-run", () => recordJobRun("intent-decay"))
    // Count active leads to process
    const total = await step.run("count-active-leads", async () => {
      return prisma.lead.count({
        where: {
          is_junk:  false,
          won_at:   null,
          lost_at:  null,
        },
      })
    })

    logger.info(`Intent decay: processing ${total} leads`)

    const batches = Math.ceil(total / BATCH_SIZE)
    let updated = 0

    for (let i = 0; i < batches; i++) {
      const batchUpdated = await step.run(`process-batch-${i}`, async () => {
        const leads = await prisma.lead.findMany({
          where: { is_junk: false, won_at: null, lost_at: null },
          skip:  i * BATCH_SIZE,
          take:  BATCH_SIZE,
          include: {
            source:  { select: { intent_baseline: true } },
            account: {
              select: {
                icp_sales_cycle:      true,
                sql_fit_threshold:    true,
                sql_intent_threshold: true,
              },
            },
            assigned_rep: { select: { email: true, first_name: true } },
            signals: {
              orderBy: { created_at: "desc" },
              take: 100,
            },
          },
        })

        let count = 0

        for (const lead of leads) {
          const signalRecords: SignalRecord[] = lead.signals.map((s) => ({
            signal_type:  s.signal_type,
            signal_value: s.signal_value,
            created_at:   s.created_at,
          }))

          const newIntentScore = computeIntentScore({
            signals:         signalRecords,
            source_baseline: lead.source.intent_baseline,
            sales_cycle:     lead.account.icp_sales_cycle,
            imported_at:     lead.imported_at,
          })

          // Skip if score unchanged
          if (newIntentScore === lead.intent_score) continue

          const newGrade = assignGrade(lead.fit_score, newIntentScore, lead.quality_score)
          const isSql    = checkSqlThreshold(
            lead.fit_score,
            newIntentScore,
            lead.account.sql_fit_threshold,
            lead.account.sql_intent_threshold,
          )
          const gradeChanged = newGrade !== lead.grade

          await prisma.$transaction(async (tx) => {
            await tx.signal.create({
              data: {
                account_id:           lead.account_id,
                lead_id:              lead.id,
                signal_type:          "INTENT_DECAY",
                signal_value:         newIntentScore - lead.intent_score,
                lead_grade_at_signal: lead.grade,
                intent_score_before:  lead.intent_score,
                intent_score_after:   newIntentScore,
              },
            })

            await tx.lead.update({
              where: { id: lead.id },
              data: {
                intent_score:     newIntentScore,
                grade:            newGrade,
                is_sql:           isSql,
                grade_changed_at: gradeChanged ? new Date() : lead.grade_changed_at,
                previous_grade:   gradeChanged ? lead.grade : lead.previous_grade,
              },
            })
          })

          // Email the assigned rep on a genuine grade DROP (audit B8). This is
          // the highest-value path for GradeDrop — the rep is offline at 02:00
          // IST, so the email (not the realtime toast) is what reaches them.
          if (gradeChanged && GRADE_RANK[newGrade] < GRADE_RANK[lead.grade] && lead.assigned_rep) {
            const anchor = lead.last_action_at ?? lead.imported_at
            await sendGradeDropEmail({
              to:                lead.assigned_rep.email,
              recipientName:     lead.assigned_rep.first_name,
              leadId:            lead.id,
              leadFirstName:     lead.first_name,
              leadLastName:      lead.last_name,
              leadCompany:       lead.company_name,
              gradeFrom:         lead.grade,
              gradeTo:           newGrade,
              expectedValue:     lead.expected_value,
              daysSinceContact:  Math.max(0, Math.floor((Date.now() - anchor.getTime()) / MS_PER_DAY)),
              reason:            "Intent decayed from inactivity — no recent engagement.",
            })
          }

          count++
        }

        return count
      })

      updated += batchUpdated
    }

    logger.info(`Intent decay complete: ${updated} leads updated`)
    return { total, updated }
  },
)
