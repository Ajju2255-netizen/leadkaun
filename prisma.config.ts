import path from "path"
import { defineConfig } from "prisma/config"

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  // Only override the datasource URL when DIRECT_URL is explicitly set.
  // Without this guard, prisma generate fails silently when DIRECT_URL is
  // absent (e.g. on Vercel CI), leaving a stale generated client.
  ...(process.env.DIRECT_URL
    ? { datasource: { url: process.env.DIRECT_URL } }
    : {}),
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
})
