/**
 * QA: Database integrity checks.
 * Run: npx tsx scripts/qa-db-check.ts
 * Writes a JSON report to /tmp/lk-qa-db.json.
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { writeFileSync } from "fs"
import { config } from "dotenv"

config({ path: ".env.local" })

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

interface Finding { severity: "info" | "warn" | "fail"; check: string; detail: unknown }
const findings: Finding[] = []
const counts: Record<string, number> = {}

function note(severity: Finding["severity"], check: string, detail: unknown) {
  findings.push({ severity, check, detail })
  const tag = severity === "fail" ? "✗" : severity === "warn" ? "!" : "·"
  console.log(`${tag} [${severity.toUpperCase()}] ${check}`)
  if (detail !== null && detail !== undefined && detail !== "") console.log("    " + JSON.stringify(detail).slice(0, 200))
}

async function main() {
  // 1. Table counts
  for (const model of [
    "account", "user", "lead", "leadSource", "pipelineStage", "leadNote",
    "followUpAction", "followUpConfig", "notification", "signal", "stageHistory",
    "smartTemplate", "winAttribution", "customField", "importJobStatus",
  ]) {
    try {
      // @ts-expect-error - dynamic model access
      const count = await prisma[model].count()
      counts[model] = count
    } catch (e) {
      note("fail", `count(${model})`, String(e).slice(0, 200))
    }
  }
  note("info", "table_counts", counts)

  // 2. Account integrity — every account should have ≥1 user
  const accountsWithoutUsers = await prisma.account.findMany({
    where: { users: { none: {} } },
    select: { id: true, name: true },
    take: 5,
  })
  if (accountsWithoutUsers.length > 0) {
    note("warn", "accounts_without_users", accountsWithoutUsers)
  } else {
    note("info", "accounts_have_users", "ok")
  }

  // 3. Lead integrity — orphan stage_id (lead points at a stage that doesn't exist)
  const orphanStageRows = await prisma.$queryRawUnsafe<Array<{ id: string; stage_id: string }>>(
    `SELECT l.id, l.stage_id FROM leads l LEFT JOIN pipeline_stages s ON s.id = l.stage_id WHERE s.id IS NULL LIMIT 5`
  )
  if (orphanStageRows.length > 0) note("fail", "leads_orphan_stage", orphanStageRows)
  else note("info", "lead_stage_refs", "ok")

  // 3b. Lead integrity — orphan source_id
  const orphanSourceRows = await prisma.$queryRawUnsafe<Array<{ id: string; source_id: string }>>(
    `SELECT l.id, l.source_id FROM leads l LEFT JOIN lead_sources s ON s.id = l.source_id WHERE s.id IS NULL LIMIT 5`
  )
  if (orphanSourceRows.length > 0) note("fail", "leads_orphan_source", orphanSourceRows)
  else note("info", "lead_source_refs", "ok")

  // 4. FollowUpAction status sanity — counts by status
  const fuByStatus = await prisma.followUpAction.groupBy({
    by: ["status"],
    _count: { _all: true },
  })
  note("info", "follow_up_by_status", fuByStatus.map((g) => ({ status: g.status, count: g._count._all })))

  // 5. Overdue check — any FollowUpAction with status=PENDING but due_date in the past?
  const stalePending = await prisma.followUpAction.count({
    where: { status: "PENDING", due_date: { lt: new Date() } },
  })
  if (stalePending > 0) {
    note("warn", "pending_with_past_due_date", { count: stalePending, hint: "Should be promoted to OVERDUE by Inngest" })
  }

  // 6. Lead won/lost mutual exclusion
  const wonAndLost = await prisma.lead.count({
    where: { AND: [{ won_at: { not: null } }, { lost_at: { not: null } }] },
  })
  if (wonAndLost > 0) note("fail", "lead_won_and_lost", { count: wonAndLost })
  else note("info", "won_lost_exclusive", "ok")

  // 7. Phone normalization — every lead's `phone` should start with "+"
  const phoneNotE164 = await prisma.lead.count({
    where: { NOT: { phone: { startsWith: "+" } } },
  })
  if (phoneNotE164 > 0) note("warn", "phone_not_normalized", { count: phoneNotE164 })
  else note("info", "phone_normalized", "ok")

  // 8. Grade distribution
  const gradeDist = await prisma.lead.groupBy({
    by: ["grade"],
    _count: { _all: true },
    orderBy: { grade: "asc" },
  })
  note("info", "grade_distribution", gradeDist.map((g) => ({ grade: g.grade, count: g._count._all })))

  // 9. Notification orphans — notifications with lead_id pointing at a non-existent lead
  const notifsWithLead = await prisma.notification.findMany({
    where: { lead_id: { not: null } },
    select: { id: true, lead_id: true, lead: { select: { id: true } } },
    take: 200,
  })
  const orphanNotifs = notifsWithLead.filter((n) => !n.lead).map((n) => ({ id: n.id, lead_id: n.lead_id }))
  if (orphanNotifs.length > 0) note("fail", "notification_lead_orphans", orphanNotifs)
  else note("info", "notification_lead_refs", "ok")

  // 10. PipelineStage integrity — every account should have ≥1 stage
  const accountsByStageCount = await prisma.account.findMany({
    select: { id: true, name: true, _count: { select: { pipeline_stages: true } } },
  })
  const noStages = accountsByStageCount.filter((a) => a._count.pipeline_stages === 0)
  if (noStages.length > 0) note("warn", "accounts_no_stages", noStages.map((a) => ({ id: a.id, name: a.name })))

  // 11. Index sanity — confirm key indexes exist (raw SQL)
  const idx = await prisma.$queryRawUnsafe<Array<{ tablename: string; indexname: string }>>(
    `SELECT tablename, indexname FROM pg_indexes WHERE schemaname='public' AND tablename IN ('leads','follow_up_actions','notifications','signals') ORDER BY tablename, indexname`
  )
  note("info", "indexes", idx)

  // 12. Stage entered_at sanity — every active lead should have stage_entered_at <= now
  const futureStaged = await prisma.lead.count({
    where: { stage_entered_at: { gt: new Date() } },
  })
  if (futureStaged > 0) note("warn", "future_stage_entered_at", { count: futureStaged })

  // 13. Negative expected_value
  const negativeValue = await prisma.lead.count({
    where: { expected_value: { lt: 0 } },
  })
  if (negativeValue > 0) note("warn", "negative_expected_value", { count: negativeValue })

  await prisma.$disconnect()

  writeFileSync("/tmp/lk-qa-db.json", JSON.stringify({ counts, findings }, null, 2))
  console.log("\n✓ Wrote /tmp/lk-qa-db.json")
  console.log(`Findings: ${findings.length} (${findings.filter(f => f.severity === "fail").length} fail, ${findings.filter(f => f.severity === "warn").length} warn)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
