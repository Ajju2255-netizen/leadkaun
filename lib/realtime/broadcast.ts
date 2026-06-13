/**
 * Server-side Supabase Realtime broadcaster.
 *
 * The dashboard's <AlertListener> (components/providers/AlertListener.tsx)
 * subscribes the browser to the channel `alerts:{userId}` and renders toasts
 * for `sql_crossed`, `grade_dropped`, and `follow_up_overdue` broadcast events.
 *
 * Nothing was ever sending those broadcasts (audit B3), so the toasts never
 * fired. This helper posts to Supabase's Realtime HTTP Broadcast API with the
 * service-role key — no websocket/subscription needed server-side.
 *
 * Fire-and-forget: it must NEVER throw into a request/job. A failed broadcast
 * is a missed toast, not a failed operation (the persistent data is already
 * written by the caller).
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function broadcastToUser(
  userId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.warn("[realtime] broadcast skipped — Supabase env not configured")
    return
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        messages: [{ topic: `alerts:${userId}`, event, payload }],
      }),
    })
    if (!res.ok) {
      console.warn(`[realtime] broadcast ${event} → ${userId} failed: ${res.status}`)
    }
  } catch (e) {
    console.warn(`[realtime] broadcast ${event} → ${userId} error:`, String(e))
  }
}
