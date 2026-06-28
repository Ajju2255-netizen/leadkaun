/**
 * Create a dev ADMIN in the seeded Demo account so DEV_AUTH_BYPASS (which logs
 * in as the first ADMIN) has someone to be. Idempotent. Staging/local only.
 *
 * Run: DATABASE_URL=... npx tsx prisma/bootstrap-dev-admin.ts
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const account = await prisma.account.findFirst({ where: { name: "Demo Company" } })
  if (!account) throw new Error("No Demo account — run `npx tsx prisma/seed.ts` first.")
  const ws = await prisma.workspace.findFirst({ where: { account_id: account.id, is_default: true } })

  const email = "dev-admin@leadkaun.local"
  let user = await prisma.user.findFirst({ where: { account_id: account.id, email } })
  if (!user) {
    user = await prisma.user.create({
      data: {
        account_id: account.id, auth_id: "dev-admin-bypass",
        email, first_name: "Dev", last_name: "Admin",
        role: "ADMIN", is_active: true,
      },
    })
  }
  if (ws) {
    await prisma.workspaceMember.upsert({
      where:  { workspace_id_user_id: { workspace_id: ws.id, user_id: user.id } },
      create: { workspace_id: ws.id, user_id: user.id },
      update: {},
    })
  }
  console.log(`✓ Dev admin ready: ${user.email} · account "${account.name}" · workspace "${ws?.name}"`)
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); return prisma.$disconnect().then(() => process.exit(1)) })
