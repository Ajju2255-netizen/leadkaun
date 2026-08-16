/**
 * Activation-funnel client helper.
 *
 * Fire-and-forget by design: telemetry must never delay or break the flow it
 * is measuring — that is precisely the flow we are trying to unblock.
 * Deduplication happens server-side, so callers can fire freely.
 */
export type FunnelStep =
  | "onboarding_started"
  | "import_started"
  | "analysis_completed"
  | "report_viewed"
  | "import_approved"
  | "first_priority_viewed"

export function trackFunnel(step: FunnelStep, detail?: Record<string, unknown>) {
  if (typeof window === "undefined") return
  try {
    void fetch("/api/events/funnel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, detail }),
      credentials: "include",
      keepalive: true, // survive the navigation that often follows the step
    }).catch(() => {})
  } catch {
    /* never surface telemetry failures */
  }
}
