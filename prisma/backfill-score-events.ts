/**
 * One-time backfill: seed the Score Evolution timeline for existing leads.
 * For each lead with no events yet: a CREATED baseline (at import time) plus an
 * ACTIVITY entry replayed from each non-baseline Signal (grade-at-signal is
 * exact; fit/quality/confidence are approximated from current state since we
 * never stored their history). Idempotent — safe to re-run.
 *
 * Run: DATABASE_URL=... npx tsx prisma/backfill-score-events.ts
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { computeConfidence } from "../lib/scoring/confidence"
import { signalLabel } from "../lib/activity/signal-labels"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const leads = await prisma.lead.findMany({
    select: {
      id: true, account_id: true, workspace_id: true, imported_at: true,
      grade: true, fit_score: true, intent_score: true, quality_score: true,
      first_name: true, phone: true, email: true, company_name: true, designation: true,
      city: true, state: true, expected_value: true, inquiry_text: true,
      signals: {
        where: { signal_type: { not: "SOURCE_BASELINE" } },
        orderBy: { created_at: "asc" },
        select: { signal_type: true, created_at: true, lead_grade_at_signal: true, intent_score_after: true },
      },
      _count: { select: { score_events: true } },
    },
  })

  let skipped = 0, eventsCreated = 0, leadsSeeded = 0
  for (const lead of leads) {
    if (lead._count.score_events > 0) { skipped++; continue }
    const confidence = computeConfidence(lead).score

    const rows: import("@prisma/client").Prisma.LeadScoreEventCreateManyInput[] = [{
      account_id: lead.account_id, workspace_id: lead.workspace_id, lead_id: lead.id,
      kind: "CREATED", occurred_at: lead.imported_at,
      grade: lead.grade, confidence, fit_score: lead.fit_score, intent_score: lead.intent_score, quality_score: lead.quality_score,
      summary: "Imported", detail: { backfilled: true },
    }]
    for (const s of lead.signals) {
      rows.push({
        account_id: lead.account_id, workspace_id: lead.workspace_id, lead_id: lead.id,
        kind: "ACTIVITY", occurred_at: s.created_at,
        grade: s.lead_grade_at_signal, confidence,
        fit_score: lead.fit_score, intent_score: s.intent_score_after, quality_score: lead.quality_score,
        summary: signalLabel(s.signal_type).label, detail: { backfilled: true, signal_type: s.signal_type },
      })
    }
    await prisma.leadScoreEvent.createMany({ data: rows })
    eventsCreated += rows.length
    leadsSeeded++
  }

  console.log(`Score-event backfill: leads=${leads.length} seeded=${leadsSeeded} skipped(existing)=${skipped} events=${eventsCreated}`)
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); return prisma.$disconnect().then(() => process.exit(1)) })
