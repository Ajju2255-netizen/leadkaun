/**
 * Human labels + categories for every Signal type.
 *
 * Single source of truth for rendering the activity feed and dashboard pulse.
 * Categories drive the icon/colour of each activity row.
 */

export type SignalCategory = "call" | "whatsapp" | "import" | "system" | "email"

export const SIGNAL_LABELS: Record<string, { label: string; category: SignalCategory }> = {
  CALL_ANSWERED_INTERESTED:     { label: "Lead picked up — interested",      category: "call" },
  CALL_ANSWERED_NOT_INTERESTED: { label: "Lead picked up — not interested",  category: "call" },
  CALL_ANSWERED_CALLBACK:       { label: "Lead asked for a callback",        category: "call" },
  CALL_ANSWERED_WRONG_NUMBER:   { label: "Wrong number on call",             category: "call" },
  CALL_NOT_ANSWERED:            { label: "Call not answered",                category: "call" },
  CALL_BUSY:                    { label: "Call busy",                        category: "call" },
  CALL_INVALID:                 { label: "Invalid number",                   category: "call" },
  CALL_VOICEMAIL:               { label: "Reached voicemail",                category: "call" },
  WA_REPLIED_1H:                { label: "Replied on WhatsApp within 1h",    category: "whatsapp" },
  WA_REPLIED_4H:                { label: "Replied on WhatsApp within 4h",    category: "whatsapp" },
  WA_REPLIED_24H:               { label: "Replied on WhatsApp",              category: "whatsapp" },
  WA_NO_REPLY:                  { label: "No WhatsApp reply",                category: "whatsapp" },
  WA_TAG_ASKED_PRICING:         { label: "Asked pricing on WhatsApp",        category: "whatsapp" },
  WA_TAG_BROCHURE:              { label: "Asked for brochure",               category: "whatsapp" },
  WA_TAG_NEGOTIATING:           { label: "Negotiating on WhatsApp",          category: "whatsapp" },
  WA_TAG_COMPARING:             { label: "Comparing options",                category: "whatsapp" },
  WA_TAG_DECISION_PENDING:      { label: "Decision pending",                 category: "whatsapp" },
  WA_TAG_NOT_SERIOUS:           { label: "Not a serious buyer",              category: "whatsapp" },
  WA_STAGE_ADVANCED:            { label: "Stage advanced via WhatsApp",      category: "whatsapp" },
  EMAIL_OPENED:                 { label: "Email opened",                     category: "email" },
  EMAIL_CLICKED:                { label: "Email link clicked",               category: "email" },
  IMPORT_HIGH_INTENT:           { label: "Imported — high intent",           category: "import" },
  IMPORT_MEDIUM_INTENT:         { label: "Imported — medium intent",         category: "import" },
  IMPORT_LOW_INTENT:            { label: "Imported — low intent",            category: "import" },
  IMPORT_RECENT_CONTACT:        { label: "Imported — recent contact",        category: "import" },
  IMPORT_WARM_CONTACT:          { label: "Imported — warm contact",          category: "import" },
  IMPORT_STALE_CONTACT:         { label: "Imported — stale contact",         category: "import" },
  IMPORT_ACTIVE_INTEREST:       { label: "Imported — active interest noted", category: "import" },
  IMPORT_NEGATIVE_SIGNAL:       { label: "Imported — negative signal",       category: "import" },
  INQUIRY_HIGH_SPECIFICITY:     { label: "High-specificity inquiry",         category: "import" },
  INQUIRY_MED_SPECIFICITY:      { label: "Medium-specificity inquiry",       category: "import" },
  SOURCE_BASELINE:              { label: "New lead added",                   category: "import" },
  INQUIRY_EVENING_WEEKEND:      { label: "After-hours inquiry",              category: "import" },
  RE_INQUIRY:                   { label: "Re-inquired",                      category: "import" },
  REP_VERY_INTERESTED:          { label: "Rep flagged: very interested",     category: "system" },
  REP_NOT_INTERESTED:           { label: "Rep flagged: not interested",      category: "system" },
  INTENT_DECAY:                 { label: "Intent decayed (no activity)",     category: "system" },
  STAGE_PROPOSAL_SENT:          { label: "Proposal sent",                    category: "system" },
}

/** Label + category for a signal type, with a graceful fallback for unmapped types. */
export function signalLabel(signalType: string): { label: string; category: SignalCategory } {
  return (
    SIGNAL_LABELS[signalType] ?? {
      label: signalType.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
      category: "system",
    }
  )
}

/** The set of signal categories a rep "performed" (vs system-generated), used by the feed filter. */
export const ACTIVITY_CATEGORIES: SignalCategory[] = ["call", "whatsapp", "email", "import", "system"]
