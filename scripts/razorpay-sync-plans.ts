/**
 * Create a Razorpay Plan entity for every sellable row in our `plans` table and
 * store the returned id in `plans.provider_plan_id`.
 *
 * Idempotent: a plan that already has a provider_plan_id is skipped. Razorpay
 * Plans are immutable — you cannot change the amount of an existing one. To
 * reprice, null out provider_plan_id, update price_inr, and re-run; existing
 * subscribers stay on the old Razorpay plan until they resubscribe.
 *
 * Run (test):
 *   RAZORPAY_KEY_ID=rzp_test_… RAZORPAY_KEY_SECRET=… DATABASE_URL=… \
 *     npx tsx scripts/razorpay-sync-plans.ts
 *
 * Run (live) — double-check the amounts printed in the dry run first:
 *   … npx tsx scripts/razorpay-sync-plans.ts --commit
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { createPlan } from "../lib/billing/razorpay"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`

async function main() {
  const commit = process.argv.includes("--commit")
  const keyId = process.env.RAZORPAY_KEY_ID ?? ""
  const isLive = keyId.startsWith("rzp_live_")

  if (!keyId) throw new Error("RAZORPAY_KEY_ID is not set")

  console.log(`Razorpay mode: ${isLive ? "LIVE ⚠️" : "test"} (${keyId})`)
  if (!commit) console.log("DRY RUN — pass --commit to actually create plans.\n")

  // `trial` is free and never charged, so it gets no Razorpay Plan.
  const plans = await prisma.plan.findMany({
    where: { is_active: true, key: { not: "trial" } },
    orderBy: { price_inr: "asc" },
  })

  for (const plan of plans) {
    if (plan.provider_plan_id) {
      console.log(`  ✓ ${plan.key.padEnd(8)} already synced → ${plan.provider_plan_id}`)
      continue
    }
    if (plan.price_inr <= 0) {
      console.log(`  ⊘ ${plan.key.padEnd(8)} skipped: price is ${plan.price_inr}`)
      continue
    }

    console.log(`  → ${plan.key.padEnd(8)} ${rupees(plan.price_inr)}/mo  "${plan.name}"`)
    if (!commit) continue

    const created = await createPlan({
      name: `Leadkaun ${plan.name}`,
      amountPaise: plan.price_inr,
    })
    await prisma.plan.update({
      where: { id: plan.id },
      data: { provider_plan_id: created.id },
    })
    console.log(`     created ${created.id}`)
  }

  if (!commit) {
    console.log("\nNothing was created. Verify the ₹ amounts above, then re-run with --commit.")
  }
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
