/**
 * Insert/activate a platform ("Mission Control") admin. Keyed by Supabase
 * auth_id. Idempotent. The auth user must already exist in Supabase, and the
 * email must also be in the PLATFORM_ADMIN_EMAILS allowlist to gain access.
 *
 * Run: DATABASE_URL=... npx tsx prisma/bootstrap-platform-admin.ts <auth_id> <email> [SUPER_ADMIN|SUPPORT]
 *
 * On local/staging with DEV_AUTH_BYPASS, any auth_id works (the bypass picks
 * the first active platform admin), so a placeholder auth_id is fine.
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const [authId, email, roleArg] = process.argv.slice(2)
  if (!authId || !email) {
    throw new Error("Usage: tsx prisma/bootstrap-platform-admin.ts <auth_id> <email> [SUPER_ADMIN|SUPPORT]")
  }
  const role = roleArg === "SUPPORT" ? "SUPPORT" : "SUPER_ADMIN"

  const admin = await prisma.platformAdmin.upsert({
    where: { auth_id: authId },
    create: { auth_id: authId, email: email.toLowerCase(), role, is_active: true },
    update: { email: email.toLowerCase(), role, is_active: true },
  })
  console.log(`✓ Platform admin ready: ${admin.email} · ${admin.role}`)
  console.log(`  Remember: add "${admin.email}" to PLATFORM_ADMIN_EMAILS env.`)
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); return prisma.$disconnect().then(() => process.exit(1)) })
