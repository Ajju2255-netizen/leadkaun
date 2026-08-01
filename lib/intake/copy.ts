// Fixed copy for the Import Intelligence Report. Kept here so the words are
// deliberate and reviewable in one place — the report's tone IS the product.

/**
 * "What Leadkaun will do" — expectation-setting, not analysis. Turns the report
 * from a diagnosis into a promise. Observable actions, no AI buzzwords.
 */
export const WHAT_HAPPENS_NEXT: string[] = [
  "Standardise every phone number to one format",
  "Detect and flag duplicates",
  "Build a profile for each lead",
  "Calculate an initial priority for every lead",
  "Recommend who to call first",
  "Keep learning from your team's outcomes",
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
  "Country & currency — detected from the shape of your phone numbers.",
  "Contact quality — every phone and email checked against a validity standard.",
  "Duplicates — estimated by matching standardised phone numbers within your file.",
]

/** External readiness message per level. No red, no 'failure' — low ≠ bad data. */
export const READINESS_MESSAGE: Record<"High" | "Medium" | "Low", string> = {
  High: "Ready to import.",
  Medium: "Ready to import — reviewing the highlighted fields will improve recommendations.",
  Low: "Review recommended before importing.",
}
