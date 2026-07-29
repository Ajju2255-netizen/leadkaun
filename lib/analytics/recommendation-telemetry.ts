// Client-side, fire-and-forget logger for the recommendation-interaction
// funnel. Telemetry must NEVER block or break the UI — every call swallows its
// own errors. `keepalive` lets SHOWN survive an immediate navigation.

export type RecommendationEvent =
  | "SHOWN"
  | "EXPANDED"
  | "ACCEPTED"
  | "IGNORED"
  | "DISMISSED"
  | "EXECUTED"
  | "OUTCOME"

export type RecommendationEventPayload = {
  action_label?: string
  grade_at_event?: string
  confidence_band?: string
  skip_reason?: string
}

export function logRecommendationEvent(
  leadId: string,
  event: RecommendationEvent,
  payload: RecommendationEventPayload = {},
): void {
  try {
    void fetch(`/api/leads/${leadId}/recommendation-feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, ...payload }),
      keepalive: true,
    }).catch(() => {
      /* best-effort telemetry — ignore */
    })
  } catch {
    /* never break the UI for telemetry */
  }
}
