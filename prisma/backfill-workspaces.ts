/**
 * One-time backfill: give every existing account a default "Main" workspace,
 * make every existing user a member, and stamp workspace_id onto all
 * already-existing scoped rows. Idempotent — safe to re-run.
 *
 * Run: DATABASE_URL=... npx tsx prisma/backfill-workspaces.ts
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const accounts = await prisma.account.findMany({ select: { id: true, name: true } })
  console.log(`Backfilling ${accounts.length} account(s)…`)

  for (const acc of accounts) {
    // 1. Default workspace (idempotent)
    let ws = await prisma.workspace.findFirst({ where: { account_id: acc.id, is_default: true } })
    if (!ws) {
      ws = await prisma.workspace.create({
        data: { account_id: acc.id, name: "Main", slug: "main", is_default: true, description: "Your primary workspace." },
      })
    }
    const wsId = ws.id

    // 2. All users become members (idempotent)
    const users = await prisma.user.findMany({ where: { account_id: acc.id }, select: { id: true } })
    for (const u of users) {
      await prisma.workspaceMember.upsert({
        where:  { workspace_id_user_id: { workspace_id: wsId, user_id: u.id } },
        create: { workspace_id: wsId, user_id: u.id },
        update: {},
      })
    }

    // 3. Stamp workspace_id on every scoped row that's still null
    const w = { account_id: acc.id, workspace_id: null }
    const d = { workspace_id: wsId }
    const counts = await prisma.$transaction([
      prisma.lead.updateMany({ where: w, data: d }),
      prisma.signal.updateMany({ where: w, data: d }),
      prisma.followUpAction.updateMany({ where: w, data: d }),
      prisma.importJobStatus.updateMany({ where: w, data: d }),
      prisma.notification.updateMany({ where: w, data: d }),
      prisma.pipelineStage.updateMany({ where: w, data: d }),
      prisma.leadSource.updateMany({ where: w, data: d }),
      prisma.followUpConfig.updateMany({ where: w, data: d }),
      prisma.smartTemplate.updateMany({ where: w, data: d }),
      prisma.customField.updateMany({ where: w, data: d }),
    ])
    const leads = counts[0].count
    console.log(`  ${acc.name}: ws=${wsId} members=${users.length} leads=${leads} (+ signals/fu/config stamped)`)
  }
  console.log("Backfill complete ✓")
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1) })
