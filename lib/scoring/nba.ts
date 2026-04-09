import type { SignalType, LeadGrade } from "@prisma/client"
import type { NextBestAction, SignalRecord } from "./types"

/**
 * Computes the Next Best Action for a lead based on the most recent signals
 * and current grade.
 *
 * Rules are evaluated in priority order. First match wins.
 * TAD ref: Section 4.6
 */
export function computeNextBestAction(
  grade: LeadGrade,
  signals: SignalRecord[],
  hasBeenContacted: boolean,
): NextBestAction {
  const recent = signals
    .slice()
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())

  const lastSignalType = recent[0]?.signal_type as SignalType | undefined
  const recentTypes = new Set(recent.slice(0, 5).map((s) => s.signal_type as SignalType))

  // ── Not contacted yet ────────────────────────────────────────────────────
  if (!hasBeenContacted) {
    if (grade === "A") {
      return {
        action: "Call now",
        reason: "New A-grade lead — call within the hour",
        priority: "urgent",
      }
    }
    return {
      action: "Send introduction",
      reason: "First contact — introduce yourself via WhatsApp",
      priority: "high",
    }
  }

  // ── Disqualifying signals ────────────────────────────────────────────────
  if (
    recentTypes.has("CALL_ANSWERED_WRONG_NUMBER") ||
    recentTypes.has("WA_TAG_WRONG_NUMBER") ||
    recentTypes.has("CALL_INVALID")
  ) {
    return {
      action: "Verify contact details",
      reason: "Invalid number or wrong contact — verify before next attempt",
      priority: "normal",
    }
  }

  // ── Strong buying signals ────────────────────────────────────────────────
  if (recentTypes.has("WA_TAG_NEGOTIATING")) {
    return {
      action: "Schedule closing call",
      reason: "Actively negotiating — move to close",
      priority: "urgent",
    }
  }

  if (recentTypes.has("WA_TAG_ASKED_PRICING") || recentTypes.has("STAGE_PROPOSAL_SENT")) {
    return {
      action: "Follow up on proposal",
      reason: "Pricing discussed — follow up within 24 hours",
      priority: "high",
    }
  }

  if (recentTypes.has("CALL_ANSWERED_CALLBACK")) {
    return {
      action: "Call back as promised",
      reason: "Lead asked for a callback — don't miss this",
      priority: "urgent",
    }
  }

  if (recentTypes.has("CALL_ANSWERED_INTERESTED")) {
    return {
      action: "Send proposal",
      reason: "Expressed interest on call — send proposal today",
      priority: "high",
    }
  }

  if (recentTypes.has("WA_TAG_COMPARING")) {
    return {
      action: "Send comparison / USP",
      reason: "Comparing options — highlight your advantage",
      priority: "high",
    }
  }

  if (recentTypes.has("WA_REPLIED_1H") || recentTypes.has("WA_REPLIED_4H")) {
    return {
      action: "Call while hot",
      reason: "Replied to WhatsApp — strike while engaged",
      priority: "high",
    }
  }

  // ── Negative / stalled signals ───────────────────────────────────────────
  if (recentTypes.has("CALL_ANSWERED_NOT_INTERESTED")) {
    return {
      action: "Re-engage in 30 days",
      reason: "Not interested now — schedule a future follow-up",
      priority: "normal",
    }
  }

  if (recentTypes.has("WA_TAG_NOT_SERIOUS") || recentTypes.has("WA_TAG_GENERAL_CHAT")) {
    return {
      action: "Try a different approach",
      reason: "Low engagement — send value content, not a sales pitch",
      priority: "normal",
    }
  }

  // ── Unanswered attempts ──────────────────────────────────────────────────
  const missedCallCount = recent
    .slice(0, 5)
    .filter((s) => (s.signal_type as SignalType) === "CALL_NOT_ANSWERED").length

  if (missedCallCount >= 3) {
    return {
      action: "Switch to WhatsApp",
      reason: "3 unanswered calls — try WhatsApp instead",
      priority: "high",
    }
  }

  if (lastSignalType === "CALL_NOT_ANSWERED" || lastSignalType === "CALL_BUSY") {
    return {
      action: "Try calling again",
      reason: "Call not answered — retry at a different time",
      priority: "normal",
    }
  }

  if (lastSignalType === "WA_NO_REPLY") {
    return {
      action: "Follow up call",
      reason: "No WhatsApp reply — try calling instead",
      priority: "normal",
    }
  }

  // ── Decay / stale lead ───────────────────────────────────────────────────
  if (lastSignalType === "INTENT_DECAY") {
    return {
      action: "Re-engage now",
      reason: "Lead going cold — reach out before intent drops further",
      priority: "high",
    }
  }

  if (recentTypes.has("RE_INQUIRY")) {
    return {
      action: "Prioritise — came back",
      reason: "Re-inquired — high buying signal, act fast",
      priority: "urgent",
    }
  }

  // ── Default by grade ─────────────────────────────────────────────────────
  if (grade === "A" || grade === "B") {
    return {
      action: "Log next interaction",
      reason: "Keep momentum — log your next touchpoint",
      priority: "high",
    }
  }

  return {
    action: "Schedule follow-up",
    reason: "Stay in touch — log next follow-up",
    priority: "normal",
  }
}
