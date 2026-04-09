/**
 * Formatting utilities for Leadkaun UI.
 */

/**
 * Format a rupee amount in the compact Indian format:
 * ₹X.XL (lakhs) or ₹X.XCr (crores).
 *
 * Examples:
 *   50000    → "₹50K"
 *   150000   → "₹1.5L"
 *   1000000  → "₹10L"
 *   10000000 → "₹1Cr"
 */
export function formatRupee(amount: number | null | undefined): string {
  if (amount == null) return "—"
  if (amount === 0) return "₹0"

  if (amount >= 10_000_000) {
    const cr = amount / 10_000_000
    return `₹${cr % 1 === 0 ? cr : cr.toFixed(1)}Cr`
  }
  if (amount >= 100_000) {
    const l = amount / 100_000
    return `₹${l % 1 === 0 ? l : l.toFixed(1)}L`
  }
  if (amount >= 1_000) {
    const k = amount / 1_000
    return `₹${k % 1 === 0 ? k : k.toFixed(1)}K`
  }
  return `₹${amount}`
}

/**
 * Full Indian rupee format with commas (for modals, detail views).
 * 1500000 → "₹15,00,000"
 */
export function formatRupeeFull(amount: number | null | undefined): string {
  if (amount == null) return "—"
  return `₹${amount.toLocaleString("en-IN")}`
}

/**
 * Format a score (0–100) to one decimal place.
 */
export function formatScore(score: number | null | undefined): string {
  if (score == null) return "—"
  return score.toFixed(0)
}

/**
 * Format a percentage (0–100) with % suffix.
 */
export function formatPct(value: number | null | undefined): string {
  if (value == null) return "—"
  return `${Math.round(value)}%`
}

/**
 * Format hours as "Xh Ym" or "Xd Yh".
 */
export function formatDuration(hours: number | null | undefined): string {
  if (hours == null) return "—"
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours < 24) return `${Math.round(hours)}h`
  const days = Math.floor(hours / 24)
  const remaining = Math.round(hours % 24)
  return remaining > 0 ? `${days}d ${remaining}h` : `${days}d`
}

/**
 * Relative time from now ("2h ago", "3d ago").
 */
export function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return "—"
  const d     = typeof date === "string" ? new Date(date) : date
  const diff  = Date.now() - d.getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)

  if (mins < 1)   return "just now"
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 30)  return `${days}d ago`
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}
