// Demo-seed extras: lost leads (loss analysis) + notifications of each type.
// Complements seed-rep-tracking-demo.js + seed-missed-leads.js.
// Usage: node scripts/seed-demo-extras.js [target-email]
// Idempotent: replaces the account's notifications; only adds lost leads if
// the account has fewer than the target count.

const fs = require("fs")
const path = require("path")
const envPath = path.join(__dirname, "..", ".env.local")
for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?/)
  if (m) process.env[m[1]] = m[2]
}

const { PrismaClient } = require("@prisma/client")
const { PrismaPg } = require("@prisma/adapter-pg")
const { Pool } = require("pg")

const TARGET_EMAIL = process.argv[2] || "e2e@leadkaun.test"
const LOSS_REASONS = ["PRICE_TOO_HIGH", "WENT_COMPETITOR", "NO_BUDGET", "NO_RESPONSE", "REQUIREMENT_CHANGED", "WRONG_FIT"]

function daysAgo(d) { return new Date(Date.now() - d * 86_400_000) }

;(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
  try {
    const user = await prisma.user.findFirst({ where: { email: TARGET_EMAIL }, include: { account: true } })
    if (!user) throw new Error(`User ${TARGET_EMAIL} not found`)
    const accountId = user.account.id
    console.log(`Target account: ${accountId} (${user.account.name})`)

    const lostStage = await prisma.pipelineStage.findFirst({ where: { account_id: accountId, is_lost: true } })

    // ── Lost leads (for analytics loss analysis) ──────────────────────────
    const existingLost = await prisma.lead.count({ where: { account_id: accountId, lost_at: { not: null } } })
    const TARGET_LOST = 6
    if (existingLost < TARGET_LOST) {
      const candidates = await prisma.lead.findMany({
        where: { account_id: accountId, won_at: null, lost_at: null, is_missed: false },
        orderBy: { expected_value: "desc" },
        take: TARGET_LOST - existingLost,
        select: { id: true, first_name: true, expected_value: true },
      })
      for (let i = 0; i < candidates.length; i++) {
        const l = candidates[i]
        await prisma.lead.update({
          where: { id: l.id },
          data: {
            lost_at: daysAgo(2 + i * 4),                      // spread across this month
            loss_reason: LOSS_REASONS[i % LOSS_REASONS.length],
            ...(lostStage ? { stage_id: lostStage.id } : {}),
          },
        })
        console.log(`  ✗ lost: ${l.first_name} — ${LOSS_REASONS[i % LOSS_REASONS.length]}`)
      }
    } else {
      console.log(`  (already ${existingLost} lost leads — skipping)`)
    }

    // ── Notifications of each type ────────────────────────────────────────
    await prisma.notification.deleteMany({ where: { account_id: accountId } })

    // Rep-targeted notifications (RECOVERY/FOLLOW_UP_DUE/EXEC_SCORE_LOW) are only
    // visible to that rep. The demo logs in as this admin, so target the admin
    // here so all five notification types render in the demo view.
    const repId = user.id
    const repId2 = user.id
    const missed = await prisma.lead.findMany({
      where: { account_id: accountId, is_missed: true },
      orderBy: { expected_value: "desc" }, take: 6,
      select: { id: true, first_name: true, last_name: true, expected_value: true, grade: true },
    })
    const fmt = (v) => v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${(v / 1000).toFixed(0)}K`

    const rows = []
    // AT_RISK (account-wide)
    for (const l of missed.slice(0, 2)) rows.push({
      account_id: accountId, user_id: null, lead_id: l.id, type: "AT_RISK",
      title: `${fmt(l.expected_value ?? 0)} lead going cold`,
      message: `${l.first_name} ${l.last_name ?? ""} — no action taken, approaching missed threshold`.trim(),
      priority: l.grade === "A" ? "high" : "medium", action_url: "/queue",
      is_read: false, created_at: daysAgo(0.1),
    })
    // MISSED (account-wide)
    for (const l of missed.slice(0, 3)) rows.push({
      account_id: accountId, user_id: null, lead_id: l.id, type: "MISSED",
      title: `❌ ${fmt(l.expected_value ?? 0)} lead missed`,
      message: `${l.first_name} ${l.last_name ?? ""} went cold — no action taken in time`.trim(),
      priority: l.grade === "A" ? "high" : "medium", action_url: "/missed",
      is_read: false, created_at: daysAgo(0.5),
    })
    // RECOVERY (rep-targeted, A/B)
    for (const l of missed.filter((m) => m.grade === "A" || m.grade === "B").slice(0, 2)) rows.push({
      account_id: accountId, user_id: repId, lead_id: l.id, type: "RECOVERY",
      title: `Recover ${fmt(l.expected_value ?? 0)} lead`,
      message: `${l.first_name} ${l.last_name ?? ""} went cold but is still worth a call — reach out now to recover it`.trim(),
      priority: l.grade === "A" ? "high" : "medium", action_url: `/leads/${l.id}`,
      is_read: false, created_at: daysAgo(0.3),
    })
    // FOLLOW_UP_DUE (rep-targeted)
    for (const l of missed.slice(1, 3)) rows.push({
      account_id: accountId, user_id: repId2, lead_id: l.id, type: "FOLLOW_UP_DUE",
      title: "Follow-up overdue",
      message: `${l.first_name} ${l.last_name ?? ""} — call action past due`.trim(),
      priority: "high", action_url: "/follow-ups",
      is_read: true, created_at: daysAgo(1),
    })
    // EXEC_SCORE_LOW (rep-targeted)
    if (repId) rows.push({
      account_id: accountId, user_id: repId, lead_id: null, type: "EXEC_SCORE_LOW",
      title: "Execution score below 25% at 3pm",
      message: "You've completed under a quarter of today's high-priority actions — there's still time.",
      priority: "medium", action_url: "/queue", is_read: true, created_at: daysAgo(0.2),
    })

    await prisma.notification.createMany({ data: rows })
    console.log(`  ✓ created ${rows.length} notifications (AT_RISK, MISSED, RECOVERY, FOLLOW_UP_DUE, EXEC_SCORE_LOW)`)

    console.log("=== Done. Reload /analytics + /notifications. ===")
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
})().catch((e) => { console.error(String(e)); process.exit(1) })
