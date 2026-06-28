// Records that a background (Inngest) cron fired, for Mission Control's System
// health view ("is this cron running? when last?"). NEUTRAL location: jobs
// write, only the admin panel reads. Best-effort — never throws.
//
// Call inside a memoized step so it records exactly once per run (Inngest
// re-invokes the handler per step):
//   await step.run("record-job-run", () => recordJobRun("morning-brief"))

import { prisma } from "@/lib/prisma"

export async function recordJobRun(
  fnName: string,
  status: "success" | "failed" = "success",
  error?: string,
): Promise<void> {
  try {
    await prisma.jobRun.create({
      data: { function: fnName, status, finished_at: new Date(), error: error ?? null },
    })
  } catch (e) {
    console.error("[job-run] failed to record", fnName, e)
  }
}
