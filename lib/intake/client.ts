// Client-side, fire-and-forget driver for the intake session state machine.
// Advancing the lifecycle must never block or break the UI — every call swallows
// its own errors. `keepalive` lets a late event (abandoned) survive navigation.

export type IntakeClientEvent =
  | "viewed"
  | "approved"
  | "import_started"
  | "import_completed"
  | "abandoned"
  | "cancelled"
  | "failed"

export function patchIntakeSession(
  sessionId: string,
  event: IntakeClientEvent,
  extra: Record<string, unknown> = {},
): void {
  try {
    void fetch(`/api/import/session/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, ...extra }),
      keepalive: true,
    }).catch(() => {
      /* best-effort */
    })
  } catch {
    /* never break the UI for telemetry */
  }
}
