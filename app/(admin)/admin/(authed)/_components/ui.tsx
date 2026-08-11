// ─────────────────────────────────────────────
// MISSION CONTROL — shared UI kit
//
// One vocabulary for every admin screen, built on the product's Coastal Sunrise
// tokens (app/globals.css) so the admin reads as Leadkaun, not a bolted-on tool.
// Tailwind's default sky/emerald/orange/red ramps are value-identical to the
// design tokens (sky-500 #0EA5E9, emerald-500 #10B981, orange-500 #F97316,
// red-500 #EF4444), so the utilities below stay in the same colour system.
//
// House rules encoded here:
//   · A metric with no denominator renders "—", never 0%.
//   · Every tone is semantic: sky = us/neutral-positive, emerald = healthy,
//     amber = needs attention, red = broken, slate = unknown / no data yet.
//   · "Unknown ≠ negative" (Law 1): `tone="none"` is grey, never red.
// ─────────────────────────────────────────────

import Link from "next/link"
import type { ReactNode } from "react"

export type Tone = "sky" | "emerald" | "amber" | "red" | "slate" | "violet"

const TONE_TEXT: Record<Tone, string> = {
  sky: "text-sky-600",
  emerald: "text-emerald-600",
  amber: "text-orange-600",
  red: "text-red-600",
  slate: "text-ink-muted",
  violet: "text-violet-600",
}

const TONE_DOT: Record<Tone, string> = {
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
  amber: "bg-orange-400",
  red: "bg-red-500",
  slate: "bg-slate-300",
  violet: "bg-violet-500",
}

const TONE_SOFT: Record<Tone, string> = {
  sky: "bg-sky-50 text-sky-700 border-sky-200/70",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200/70",
  amber: "bg-orange-50 text-orange-700 border-orange-200/70",
  red: "bg-red-50 text-red-700 border-red-200/70",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200/70",
}

const TONE_BAR: Record<Tone, string> = {
  sky: "bg-gradient-to-r from-sky-400 to-sky-500",
  emerald: "bg-gradient-to-r from-emerald-400 to-emerald-500",
  amber: "bg-gradient-to-r from-orange-300 to-orange-400",
  red: "bg-gradient-to-r from-red-400 to-red-500",
  slate: "bg-slate-300",
  violet: "bg-gradient-to-r from-violet-400 to-violet-500",
}

// ── Formatters ────────────────────────────────────────────────────────────────

export const num = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-IN").format(n)

/** Rupees (already in ₹, not paise). Compacts at ≥1 lakh. */
export function inr(n: number | null | undefined): string {
  if (n == null) return "—"
  if (Math.abs(n) >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`
  if (Math.abs(n) >= 100_000) return `₹${(n / 100_000).toFixed(2)}L`
  return `₹${new Intl.NumberFormat("en-IN").format(Math.round(n))}`
}

/** A rate that may legitimately have no denominator yet. */
export const pctOrDash = (n: number | null | undefined) => (n == null ? "—" : `${n}%`)

export function ago(d: Date | string | null | undefined): string {
  if (!d) return "never"
  const ms = Date.now() - new Date(d).getTime()
  const m = Math.floor(ms / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  if (m < 1440) return `${Math.floor(m / 60)}h ago`
  const days = Math.floor(m / 1440)
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.round(days / 30)}mo ago`
  return `${Math.round(days / 365)}y ago`
}

export const dateOnly = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "—"

export const dateTime = (d: Date | string | null | undefined) =>
  d
    ? new Date(d).toLocaleString("en-IN", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        timeZone: "Asia/Kolkata",
      })
    : "—"

export const clockIst = (d: Date | string | null | undefined) =>
  d
    ? new Date(d).toLocaleTimeString("en-IN", {
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata",
      })
    : "—"

/** Human duration from milliseconds — for Time-to-Trust and job runtimes. */
export function duration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—"
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${Math.round(s % 60)}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

// ── Primitives ────────────────────────────────────────────────────────────────

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-[24px] font-black tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="text-[13px] text-ink-soft mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-3">
      <p className="section-label">{children}</p>
      {right && <div className="text-[11px] text-ink-muted">{right}</div>}
    </div>
  )
}

export function Card({ children, className = "", pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <div className={`rounded-2xl glass-2 ${pad ? "px-5 py-4" : ""} ${className}`}>{children}</div>
  )
}

export function Dot({ tone, glow = false }: { tone: Tone; glow?: boolean }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${TONE_DOT[tone]} ${
        glow && tone === "emerald" ? "shadow-[0_0_8px] shadow-emerald-400/60" : ""
      }`}
    />
  )
}

export function Pill({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TONE_SOFT[tone]}`}>
      {children}
    </span>
  )
}

/**
 * A headline metric. `value` is pre-formatted; pass "—" for "no data yet" and
 * put the reason in `sub` so a blank never reads as a real zero.
 */
export function Kpi({
  label, value, sub, tone = "slate", href, hint,
}: {
  label: string
  value: string
  sub?: string
  tone?: Tone
  href?: string
  /** What this metric actually counts — every KPI needs a definition. */
  hint?: string
}) {
  const body = (
    <div className="rounded-2xl glass-2 px-5 py-4 h-full">
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className={`text-[26px] font-black tabular-nums leading-tight mt-1 ${value === "—" ? "text-ink-faint" : TONE_TEXT[tone]}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-ink-muted mt-0.5">{sub}</p>}
      {hint && <p className="text-[10.5px] text-ink-faint mt-1.5 leading-snug">{hint}</p>}
    </div>
  )
  return href ? (
    <Link href={href} className="block lift aura-sky-hover rounded-2xl">{body}</Link>
  ) : body
}

/** Compact figure for dense grids (Company 360, usage rows). */
export function Stat({ label, value, tone = "slate", sub }: { label: string; value: string; tone?: Tone; sub?: string }) {
  return (
    <div className="rounded-xl glass-1 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className={`text-[17px] font-black tabular-nums mt-0.5 ${value === "—" ? "text-ink-faint" : tone === "slate" ? "text-ink" : TONE_TEXT[tone]}`}>
        {value}
      </p>
      {sub && <p className="text-[10.5px] text-ink-muted mt-0.5">{sub}</p>}
    </div>
  )
}

export function Bar({ pct, tone = "sky", height = "h-2" }: { pct: number; tone?: Tone; height?: string }) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <div className={`${height} rounded-full bg-slate-900/[0.06] overflow-hidden`}>
      <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${w}%` }} />
    </div>
  )
}

/** Labelled progress row — "label … count · pct%" over a bar. */
export function BarRow({
  label, count, pct, tone = "sky", note,
}: { label: ReactNode; count?: number | string; pct: number | null; tone?: Tone; note?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] mb-1 gap-3">
        <span className="text-ink-soft min-w-0 truncate">{label}</span>
        <span className="text-ink-muted tabular-nums shrink-0">
          {count != null && <span className="text-ink-soft font-semibold">{typeof count === "number" ? num(count) : count}</span>}
          {count != null && pct != null && " · "}
          {pct != null && `${pct}%`}
          {note && <span className="ml-2 text-ink-faint">{note}</span>}
        </span>
      </div>
      <Bar pct={pct ?? 0} tone={pct == null ? "slate" : tone} />
    </div>
  )
}

/** A funnel step with the drop-off from the previous step made explicit. */
export function FunnelStep({
  label, count, pctOfTop, dropPct, href,
}: { label: string; count: number; pctOfTop: number; dropPct: number | null; href?: string }) {
  const inner = (
    <div>
      <div className="flex items-center justify-between text-[12px] mb-1 gap-3">
        <span className="text-ink-soft">{label}</span>
        <span className="tabular-nums shrink-0">
          <span className="text-ink font-semibold">{num(count)}</span>
          <span className="text-ink-muted"> · {pctOfTop}%</span>
          {dropPct != null && dropPct > 0 && <span className="text-orange-500 ml-2">−{dropPct}%</span>}
        </span>
      </div>
      <Bar pct={pctOfTop} tone="sky" height="h-2.5" />
    </div>
  )
  return href ? <Link href={href} className="block hover:opacity-80 transition-opacity">{inner}</Link> : inner
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-[13px] text-ink-muted">{children}</p>
}

/** Explains why a panel is empty because a dependency isn't wired, not because nothing happened. */
export function NotWired({ what, why }: { what: string; why: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 px-5 py-6 text-center">
      <p className="text-[13px] font-semibold text-ink-soft">{what}</p>
      <p className="text-[12px] text-ink-muted mt-1 max-w-md mx-auto leading-relaxed">{why}</p>
    </div>
  )
}

// ── Tables ────────────────────────────────────────────────────────────────────

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl glass-2 overflow-hidden">
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <th className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted whitespace-nowrap ${className}`}>{children}</th>
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 text-[12.5px] text-ink-soft align-middle ${className}`}>{children}</td>
}

export function Tr({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <tr className={`hover:bg-sky-50/60 transition-colors ${className}`}>{children}</tr>
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-slate-900/[0.03] border-b border-hairline"><tr>{children}</tr></thead>
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-hairline">{children}</tbody>
}

// ── Domain badges ─────────────────────────────────────────────────────────────

const GRADE_STYLE: Record<string, string> = {
  A: "bg-emerald-500 text-white",
  B: "bg-sky-500 text-white",
  C: "bg-orange-400 text-white",
  D: "bg-orange-500 text-white",
  E: "bg-red-500 text-white",
  F: "bg-slate-400 text-white",
}

export function Grade({ grade }: { grade: string }) {
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-[12px] font-black ${GRADE_STYLE[grade] ?? "bg-slate-300 text-white"}`}>
      {grade}
    </span>
  )
}

export const healthTone = (band: string): Tone =>
  band === "healthy" ? "emerald" : band === "warning" ? "amber" : "red"

export const riskTone = (risk: string): Tone =>
  risk === "low" ? "emerald" : risk === "medium" ? "amber" : "red"

/** true / false / null(=no data yet). Never renders "unknown" as a failure. */
export function HealthPill({ label, state, note }: { label: string; state: boolean | null; note?: string }) {
  const tone: Tone = state === true ? "emerald" : state === false ? "red" : "slate"
  return (
    <div className="flex items-center gap-2.5 rounded-xl glass-1 px-3.5 py-2.5">
      <Dot tone={tone} glow />
      <span className="text-[12.5px] font-semibold text-ink-soft">{label}</span>
      <span className="ml-auto text-[10.5px] text-ink-faint shrink-0">
        {state === true ? "healthy" : state === false ? "degraded" : note ?? "no data yet"}
      </span>
    </div>
  )
}
