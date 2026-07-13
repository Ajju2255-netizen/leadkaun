/**
 * Grandfather existing accounts onto a plan before the new pricing goes live.
 *
 * Without a subscription row, every account falls back to the Free tier (1 seat,
 * 100 active leads, no premium features). Run this AT PHASE 2 — after the pricing
 * migration is applied and before/with the merge — so existing customers keep
 * full access instead of being unexpectedly restricted.
 *
 * It creates an ACTIVE subscription with provider = null (a comped, non-charging
 * plan — the founder can convert or edit it later from Company 360). Only touches
 * accounts that have NO subscription yet, so it's idempotent and safe to re-run.
 *
 * Run (dry run — prints what it would do):
 *   DATABASE_URL=… npx tsx scripts/grandfather-accounts.ts
 * Commit, choosing the plan (default: growth):
 *   DATABASE_URL=… npx tsx scripts/grandfather-accounts.ts --commit --plan=growth
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`

async function main() {
  const commit = process.argv.includes("--commit")
  const planArg = process.argv.find((a) => a.startsWith("--plan="))?.split("=")[1] ?? "growth"

  const plan = await prisma.plan.findUnique({ where: { key: planArg } })
  if (!plan) {
    throw new Error(`Unknown plan "${planArg}". Use one of: starter | growth | scale.`)
  }
  if (planArg === "trial" || planArg === "enterprise") {
    throw new Error(`Refusing to grandfather onto "${planArg}". Pick a paid self-serve tier.`)
  }

  // Accounts with no subscription row at all.
  const accounts = await prisma.account.findMany({
    where: { NOT: { id: { in: (await prisma.subscription.findMany({ select: { account_id: true } })).map((s) => s.account_id) } } },
    select: { id: true, name: true },
    orderBy: { created_at: "asc" },
  })

  console.log(`Plan: ${plan.name} (${rupees(plan.price_inr)}/mo · ${plan.max_seats} seats · ${plan.active_lead_limit ?? "∞"} active leads)`)
  console.log(`${accounts.length} account(s) without a subscription will be grandfathered.`)
  if (!commit) console.log("\nDRY RUN — pass --commit to write. Choose a plan with --plan=<key>.\n")

  for (const acc of accounts) {
    console.log(`  ${commit ? "→" : "·"} ${acc.name} (${acc.id})`)
    if (!commit) continue
    await prisma.subscription.create({
      data: {
        account_id: acc.id,
        plan_id: plan.id,
        status: "active", // full access; comped
        mrr_inr: 0, // grandfathered — not counted toward MRR
        provider: null, // not a real Razorpay subscription
        billing_cycle: "monthly",
      },
    })
  }

  if (commit) console.log(`\nDone. Grandfathered ${accounts.length} account(s) onto ${plan.name}.`)
  else console.log(`\nWould grandfather ${accounts.length} account(s). Re-run with --commit.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
