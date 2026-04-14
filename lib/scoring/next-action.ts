import type { LeadGrade } from "@prisma/client"

export interface NextAction {
  label:    string   // e.g. "🔥 Call now"
  priority: number   // 1 = most urgent
  reason:   string   // static tooltip text
  color:    string   // Tailwind text+bg+border classes
}

const ACTION_MAP: Record<LeadGrade, NextAction> = {
  A: {
    label:    "🔥 Call now",
    priority: 1,
    reason:   "High intent — likely to convert immediately",
    color:    "text-green-700 bg-green-50 border-green-200",
  },
  B: {
    label:    "📞 Call today",
    priority: 2,
    reason:   "Good lead — engage before interest cools",
    color:    "text-blue-700 bg-blue-50 border-blue-200",
  },
  C: {
    label:    "📩 Nurture",
    priority: 3,
    reason:   "Moderate interest — send follow-up material",
    color:    "text-amber-700 bg-amber-50 border-amber-200",
  },
  D: {
    label:    "⏳ Low priority",
    priority: 4,
    reason:   "Weak signal — revisit when capacity allows",
    color:    "text-gray-500 bg-gray-50 border-gray-200",
  },
  E: {
    label:    "❌ Drop",
    priority: 5,
    reason:   "No meaningful signal — not worth pursuing now",
    color:    "text-red-500 bg-red-50 border-red-200",
  },
  F: {
    label:    "🗑 Junk",
    priority: 6,
    reason:   "Invalid or incomplete data",
    color:    "text-red-400 bg-red-50 border-red-100",
  },
}

export function getNextAction(grade: string): NextAction {
  return ACTION_MAP[grade as LeadGrade] ?? ACTION_MAP["D"]
}

/**
 * Builds a contextual "why" sentence for the lead detail view.
 * Reads actual notes keywords + scores instead of returning a generic string.
 */
export function buildActionReason(lead: {
  grade:         string
  fit_score:     number
  intent_score:  number
  quality_score: number
  inquiry_text?: string | null
}): string {
  const { grade, fit_score, intent_score } = lead
  const t = (lead.inquiry_text ?? "").toLowerCase()

  if (grade === "A") {
    if (t.includes("ready"))            return "Lead said ready to close — call immediately"
    if (t.includes("confirmed"))        return "Confirmed booking — finalize now"
    if (t.includes("booked"))           return "Booked — don't let them go cold"
    if (intent_score >= 80)             return "Very high intent signal — act before it fades"
    if (fit_score >= 70)                return "Strong ICP match with high engagement"
    return "High intent — likely to convert immediately"
  }

  if (grade === "B") {
    if (t.includes("site"))             return "Site visit interest — follow up before they visit a competitor"
    if (t.includes("demo"))             return "Demo interest — schedule it today"
    if (t.includes("callback"))         return "Requested callback — respond today"
    if (t.includes("pricing") || t.includes("rate") || t.includes("quote"))
                                        return "Asking about pricing — send a quote today"
    if (fit_score >= 55)                return "Good ICP match — worth a call today"
    if (intent_score >= 40)             return "Good intent signal — engage before it cools"
    return "Good lead — engage before interest cools"
  }

  if (grade === "C") {
    if (t.includes("interested"))       return "Expressed interest — send brochure or follow-up message"
    if (t.includes("pricing") || t.includes("rate"))
                                        return "Asking for pricing — send rates and stay in touch"
    if (t.includes("need") || t.includes("want") || t.includes("looking"))
                                        return "Has a requirement — nurture with relevant content"
    if (fit_score >= 35)                return "Fits your ICP — worth a nurture sequence"
    return "Moderate interest — keep warm with a follow-up"
  }

  if (grade === "D") {
    if (t.includes("no response"))      return "No response logged — try once more then park"
    return "Low engagement — revisit when capacity allows"
  }

  if (grade === "E") {
    if (t.includes("not interested"))   return "Lead said not interested — do not contact"
    if (t.includes("no response"))      return "No response after multiple attempts"
    if (t.includes("wrong number"))     return "Wrong number — cannot reach"
    if (t.includes("dnd") || t.includes("do not contact"))
                                        return "Lead asked not to be contacted"
    return "No meaningful engagement — not worth pursuing"
  }

  return "Review this lead manually"
}
