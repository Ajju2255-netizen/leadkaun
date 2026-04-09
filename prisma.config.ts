import path from "path"
import { defineConfig, env } from "prisma/config"

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: env("DIRECT_URL"),
  },
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
})
