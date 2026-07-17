// Prisma 7 requires a driver adapter for direct PostgreSQL connections.
// We use @prisma/adapter-pg with the native pg Pool.
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Client connections to the Supabase transaction pooler (pgbouncer, :6543),
    // which multiplexes them onto far fewer server connections — so a modest
    // per-instance pool is safe. 3 was too low: pages fan out ~20+ parallel
    // queries (e.g. the dashboard), and they serialised 3-at-a-time.
    max: 10,
  })

  const adapter = new PrismaPg(pool)

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  })
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
