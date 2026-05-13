/**
 * Channel + activity-hint derivation for the Priority Queue Top-N surface.
 *
 * Two pure functions:
 *   - channelFromSignal()  : maps a SignalType → broad channel (whatsapp / email / phone / website)
 *   - activityHintFor()    : returns a short phrase like "Asked about pricing"
 *                            from inquiry_text first, then signal label, then stage name
 *
 * Computed server-side in /api/queue so the client just renders.
 */

export type LeadChannel = "whatsapp" | "email" | "phone" | "website"

/**
 * Prefix-dispatched channel from a SignalType. Defaults to "website" — that
 * matches the reference design's slate chip for cold inbound leads.
 */
export function channelFromSignal(signalType?: string | null): LeadChannel {
  if (!signalType) return "website"
  if (signalType.startsWith("WA_"))    return "whatsapp"
  if (signalType.startsWith("CALL_"))  return "phone"
  if (signalType.startsWith("EMAIL_")) return "email"
  return "website"
}

/**
 * Short signal-derived activity label. Returns null when the signal is
 * unknown or uninteresting so the hint pipeline can fall through to the
 * next source (note-theme keyword, then stage name, then generic).
 */
function signalLabel(signalType?: string | null): string | null {
  if (!signalType) return null
  const MAP: Record<string, string> = {
    CALL_ANSWERED_INTERESTED:     "Said they're interested",
    CALL_ANSWERED_CALLBACK:       "Asked for a callback",
    CALL_ANSWERED_NOT_INTERESTED: "Answered — not interested",
    WA_REPLIED_1H:                "Replied on WhatsApp",
    WA_REPLIED_4H:                "Replied on WhatsApp",
    WA_REPLIED_24H:               "Replied on WhatsApp",
    WA_TAG_ASKED_PRICING:         "Asked about pricing",
    WA_TAG_NEGOTIATING:           "Actively negotiating",
    WA_TAG_DECISION_PENDING:      "Decision pending",
    WA_TAG_BROCHURE:              "Requested brochure",
    WA_TAG_COMPARING:             "Comparing options",
    WA_STAGE_ADVANCED:            "Moved deeper in funnel",
    EMAIL_OPENED:                 "Opened email",
    EMAIL_CLICKED:                "Clicked email link",
    STAGE_PROPOSAL_SENT:          "Proposal sent",
    REP_VERY_INTERESTED:          "Rep flagged: hot",
  }
  return MAP[signalType] ?? null
}

/**
 * Keyword-based theme extraction from free-text inquiry / notes. Mirrors
 * the rules in lib/scoring/notes-intent.ts (positive themes only — for the
 * queue we want hooks, not penalties).
 */
function noteTheme(text?: string | null): string | null {
  if (!text || !text.trim()) return null
  const t = text.toLowerCase()
  if (t.includes("ready"))          return "Ready to close"
  if (t.includes("booked demo"))    return "Booked a demo"
  if (t.includes("demo"))           return "Wants a demo"
  if (t.includes("site"))           return "Site visit booked"
  if (t.includes("callback") || t.includes("call back")) return "Callback requested"
  if (t.includes("pricing") || t.includes("quote") || t.includes("rate") || t.includes("cost") || t.includes("quotation"))
    return "Asked about pricing"
  if (t.includes("brochure"))       return "Asked for a brochure"
  if (t.includes("comparing"))      return "Comparing options"
  if (t.includes("interested"))     return "Interested"
  if (t.includes("looking for"))    return "Looking for a solution"
  if (t.includes("need"))           return "Has a stated need"
  return null
}

export interface ActivityHintLead {
  inquiry_text?:    string | null
  last_signal_type?: string | null
  stage_name?:      string | null
}

/**
 * Best short activity hint for the lead, in priority order:
 *   1. Latest signal (most recent rep-driven evidence)
 *   2. Inquiry-text theme (what the lead came in saying)
 *   3. Stage name (where they are in the pipeline)
 *   4. Generic fallback
 */
export function activityHintFor(lead: ActivityHintLead): string {
  return (
    signalLabel(lead.last_signal_type) ??
    noteTheme(lead.inquiry_text) ??
    lead.stage_name ??
    "New lead"
  )
}

/** Used by the API to expose the rounded minutes-since-last-action. */
export function activeMinutesSince(
  lastActionAt?: Date | string | null,
  importedAt?:   Date | string | null,
): number | null {
  const ts = lastActionAt ?? importedAt
  if (!ts) return null
  const t = typeof ts === "string" ? new Date(ts).getTime() : ts.getTime()
  return Math.max(0, Math.floor((Date.now() - t) / 60_000))
}
