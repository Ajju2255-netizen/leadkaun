import type { SignalType } from "@prisma/client"

/**
 * Point values for every signal type.
 * Positive = intent boost. Negative = intent penalty.
 * INTENT_DECAY is applied per-day by the nightly cron, not via this map directly.
 *
 * TAD ref: Section 4.3
 */
export const SIGNAL_WEIGHTS: Record<SignalType, number> = {
  // ── WhatsApp reply time ──────────────────────────────
  WA_REPLIED_1H:    15,   // replied within 1 hour — strong buying signal
  WA_REPLIED_4H:    10,   // replied within 4 hours
  WA_REPLIED_24H:    5,   // replied within 24 hours
  WA_NO_REPLY:      -5,   // no reply — negative intent signal

  // ── WhatsApp conversation tags ───────────────────────
  WA_TAG_ASKED_PRICING:     20,  // explicitly asked for price — very high intent
  WA_TAG_BROCHURE:          10,  // asked for brochure / catalogue
  WA_TAG_NEGOTIATING:       25,  // actively negotiating — highest WA intent signal
  WA_TAG_COMPARING:         15,  // comparing options — in-market
  WA_TAG_DECISION_PENDING:  10,  // said decision pending
  WA_TAG_NOT_SERIOUS:      -15,  // clearly not serious
  WA_TAG_GENERAL_CHAT:      -5,  // just chatting, no buying intent
  WA_TAG_WRONG_NUMBER:     -30,  // wrong contact — disqualifying

  // ── WhatsApp stage ───────────────────────────────────
  WA_STAGE_ADVANCED:   15,   // conversation progressed to next stage
  WA_STAGE_REGRESSED: -10,   // conversation went backward

  // ── Call outcomes ────────────────────────────────────
  CALL_ANSWERED_INTERESTED:    20,  // answered, expressed interest
  CALL_ANSWERED_NOT_INTERESTED:-20, // answered, explicitly not interested
  CALL_ANSWERED_CALLBACK:      10,  // answered, wants a callback
  CALL_ANSWERED_WRONG_NUMBER: -30,  // wrong number — disqualifying
  CALL_NOT_ANSWERED:           -3,  // no answer — mild negative
  CALL_BUSY:                   -2,  // busy — very mild negative
  CALL_INVALID:               -30,  // invalid/switched off — disqualifying
  CALL_VOICEMAIL:              -1,  // went to voicemail

  // ── Inquiry / import-time ────────────────────────────
  INQUIRY_HIGH_SPECIFICITY:  20,  // very specific inquiry text
  INQUIRY_MED_SPECIFICITY:   10,  // moderate inquiry specificity
  SOURCE_BASELINE:            0,  // baseline set at import (value comes from source.intent_baseline)
  RE_INQUIRY:                15,  // lead came back and re-inquired

  // ── Behavioural ──────────────────────────────────────
  INQUIRY_EVENING_WEEKEND:   8,  // inquired outside business hours — genuine need
  STAGE_PROPOSAL_SENT:      15,  // proposal was sent — advanced pipeline signal
  EMAIL_OPENED:              5,  // opened email
  EMAIL_CLICKED:            10,  // clicked link in email

  // ── Rep overrides ────────────────────────────────────
  REP_VERY_INTERESTED:  25,  // rep marks as very interested (manual override)
  REP_NOT_INTERESTED:  -25,  // rep marks as not interested (manual override)

  // ── System ───────────────────────────────────────────
  INTENT_DECAY: -3,  // applied per day by nightly cron (TAD 6.2)
}

/**
 * Number of days without a positive signal before decay begins.
 * Keyed by SalesCycle enum value.
 * TAD ref: Section 4.3.2
 */
export const DECAY_THRESHOLD_DAYS: Record<string, number> = {
  SAME_DAY:           1,
  THREE_DAYS:         3,
  TWO_WEEKS:         14,
  FOUR_WEEKS:        28,
  THREE_MONTHS:      90,
  OVER_THREE_MONTHS: 120,
}

/** Daily decay rate in intent score points (TAD 4.3.2) */
export const DECAY_RATE_PER_DAY = 3
