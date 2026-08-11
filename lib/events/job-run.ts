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
  /**
   * When the run actually began. Defaults to now, which is right for jobs that
   * record on entry. Pass it explicitly when the row is written at the END of a
   * run AND `started_at` is used as a watermark for the next run — otherwise the
   * window would begin when the previous run finished, and anything created
   * while it was executing would be skipped. See inngest/functions/signup-alert.
   */
  startedAt?: Date,
): Promise<void> {
  try {
    await prisma.jobRun.create({
      data: {
        function: fnName,
        status,
        error: error ?? null,
        finished_at: new Date(),
        ...(startedAt ? { started_at: startedAt } : {}),
      },
    })
  } catch (e) {
    console.error("[job-run] failed to record", fnName, e)
  }
}
