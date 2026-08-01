// Fixed copy for the Import Intelligence Report. Kept here so the words are
// deliberate and reviewable in one place — the report's tone IS the product.

/**
 * "What Leadkaun will do" — expectation-setting, not analysis. Turns the report
 * from a diagnosis into a promise. Observable actions, no AI buzzwords.
 */
export const WHAT_HAPPENS_NEXT: string[] = [
  "Every phone number is standardised to one format",
  "Duplicate leads are identified",
  "Each lead receives an initial profile",
  "Lead priorities are calculated",
  "Your team gets recommendations on who to contact first",
  "Leadkaun begins learning how your business sells",
]

/**
 * The one closing sentence. Psychologically load-bearing: immediate value +
 * continuous learning. Do not soften or remove it.
 */
export const CLOSING_LINE =
  "Leadkaun understands enough to help from day one. As your team works, it learns how your business sells — and every recommendation becomes more informed."

/**
 * "How did we determine this?" — the transparency panel (collapsed by default).
 * Plain-language methods, no AI mystique. Every claim in the report traces here.
 */
export const HOW_WE_DETERMINED: string[] = [
  "Industry — inferred from patterns in your company names. No external lookup.",
  "Country and currency — inferred from phone number formats and the values present in your data.",
  "Contact quality — phone numbers and email addresses were validated using standard format checks.",
  "Duplicates — estimated by matching standardised phone numbers within your file.",
]

/** External readiness message per level. No red, no 'failure' — low ≠ bad data. */
export const READINESS_MESSAGE: Record<"High" | "Medium" | "Low", string> = {
  High: "Ready to import.",
  Medium: "Ready to import — reviewing the highlighted fields will improve recommendations.",
  Low: "Review recommended before importing.",
}
