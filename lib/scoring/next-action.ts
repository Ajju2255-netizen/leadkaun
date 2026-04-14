import type { LeadGrade } from "@prisma/client"

export interface NextAction {
  label:    string   // full display text  e.g. "🔥 Call now"
  priority: number   // 1 = most urgent
  reason:   string   // one-line explanation for tooltip / detail view
  color:    string   // Tailwind text+bg classes for the badge
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
