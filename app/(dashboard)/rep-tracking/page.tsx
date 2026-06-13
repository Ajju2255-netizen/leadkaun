"use client"

import { useQuery } from "@tanstack/react-query"
import { User, IndianRupee, Clock, CheckCircle, Trophy } from "lucide-react"
import { DeltaChip } from "@/components/shared/DeltaChip"
import { Skeleton } from "@/components/ui/skeleton"
import { AvatarCircle } from "@/components/shared/AvatarCircle"

// ── Types ─────────────────────────────────────────────────────────────────────

interface RepScoreComponents {
  follow_up_pct:      number
  speed_to_lead:      number
  missed_value_recov: number
  daily_execution:    number
  conversion_rate:    number
}

interface RepStat {
  id:                       string
  first_name:               string
  last_name:                string
  email:                    string
  role:                     string
  revenue_recovered:        number
  response_time_seconds:    number | null
  follow_up_completion_pct: number | null
  /** Legacy — same as follow_up_completion_pct. Will be removed after 1 week. */
  follow_up_score:          number | null
  /** Daily Execution Score (today, 0..100). */
  daily_execution_score:    number
  /** Conversion rate MTD (won / qualified). null = no qualified yet. */
  conversion_rate:          number | null
  /** Missed-revenue recovered as % MTD. null = no missed pool. */
  missed_recovery_pct:      number | null
  /** 5-component Rep Score 0..100. */
  rep_score:                number
  rep_score_components:     RepScoreComponents
}

/** Maximum point contribution per Rep-Score component — mirrors REP_SCORE_WEIGHTS. */
const REP_SCORE_MAX = {
  follow_up_pct:      25,
  speed_to_lead:      20,
  missed_value_recov: 15,
  daily_execution:    20,
  conversion_rate:    20,
} as const

interface RepTrackingData {
  account: {
    revenue_recovered:                number
    revenue_recovered_pct_change:     number | null
    avg_response_time_seconds:        number | null
    avg_response_time_pct_change:     number | null
    follow_up_completion_pct:         number | null
    follow_up_completion_pct_change:  number | null
  }
  reps: RepStat[]
  top_performer: { id: string; first_name: string; last_name: string; revenue_recovered: number } | null
}

async function fetchRepTracking(): Promise<RepTrackingData> {
  const res = await fetch("/api/analytics/rep-tracking", { credentials: "include" })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatINR(v: number): string {
  return new Intl.NumberFormat("en-IN").format(Math.round(v))
}

function formatResponseTime(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "—"
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m >= 60) {
    const h = Math.floor(m / 60)
    return `${h}h ${m % 60}m`
  }
  return `${m}m ${String(s).padStart(2, "0")}s`
}

// Score band → color (mirrors the leads-table bar coloring logic)
function scoreColor(score: number): { bar: string; ring: string; text: string } {
  if (score >= 85) return { bar: "linear-gradient(90deg, #6EE7B7 0%, #10B981 100%)", ring: "#10B981", text: "text-emerald-600" }
  if (score >= 70) return { bar: "linear-gradient(90deg, #38BDF8 0%, #0EA5E9 100%)", ring: "#0EA5E9", text: "text-sky-600" }
  if (score >= 55) return { bar: "linear-gradient(90deg, #FDBA74 0%, #FB923C 100%)", ring: "#FB923C", text: "text-orange-500" }
  return                 { bar: "linear-gradient(90deg, #F87171 0%, #DC2626 100%)", ring: "#EF4444", text: "text-red-500" }
}

// ── ScoreRing — circular progress with centred number ─────────────────────────

function ScoreRing({ score }: { score: number }) {
  const { ring } = scoreColor(score)
  const size = 44
  const stroke = 4
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = (Math.max(0, Math.min(100, score)) / 100) * c
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={ring} strokeWidth={stroke}
          strokeDasharray={`${dash} ${c - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold text-ink tabular-nums">
        {score}
      </span>
    </div>
  )
}

// ── PerfBar — coloured progress bar under each table cell ────────────────────

function PerfBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1 w-full rounded-full overflow-hidden mt-1.5" style={{ background: "rgba(15,23,42,0.06)" }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

// ── RepScoreBreakdown — 5-segment bar showing each component's contribution ──

function RepScoreBreakdown({ components }: { components: RepScoreComponents }) {
  const segments: { key: keyof RepScoreComponents; label: string; value: number; max: number }[] = [
    { key: "follow_up_pct",      label: "FU%",        value: components.follow_up_pct,      max: REP_SCORE_MAX.follow_up_pct },
    { key: "speed_to_lead",      label: "Speed",      value: components.speed_to_lead,      max: REP_SCORE_MAX.speed_to_lead },
    { key: "missed_value_recov", label: "Recovered",  value: components.missed_value_recov, max: REP_SCORE_MAX.missed_value_recov },
    { key: "daily_execution",    label: "Exec today", value: components.daily_execution,    max: REP_SCORE_MAX.daily_execution },
    { key: "conversion_rate",    label: "Conversion", value: components.conversion_rate,    max: REP_SCORE_MAX.conversion_rate },
  ]
  return (
    <div className="flex h-1 w-full rounded-full overflow-hidden mt-1.5 gap-[2px]">
      {segments.map((s) => {
        const fillRatio = s.max > 0 ? s.value / s.max : 0
        return (
          <div
            key={s.key}
            className="h-full"
            title={`${s.label}: ${s.value}/${s.max}`}
            style={{
              width:      `${s.max}%`,
              background: scoreColor(fillRatio * 100).bar,
              opacity:    0.25 + 0.75 * fillRatio,
            }}
          />
        )
      })}
    </div>
  )
}

// ── StatCard — top-row tinted KPI tile ────────────────────────────────────────

function StatCard({
  label,
  value,
  caption,
  delta,
  deltaPositive: _deltaPositive,
  iconColor,
  iconBg,
  icon,
  valueColor,
  // For response time: lower is better, so negative delta is GOOD (mint), positive is BAD (red)
  invertDelta = false,
}: {
  label:         string
  value:         React.ReactNode
  caption:       string
  delta:         number | null
  deltaPositive: boolean | null
  iconColor:     string
  iconBg:        string
  icon:          React.ReactNode
  valueColor:    string
  invertDelta?:  boolean
}) {
  return (
    <div className="glass-3 gloss-edge rounded-2xl p-6">
      <p className="text-[12px] font-semibold text-ink-soft">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className={`text-[32px] md:text-[36px] font-bold tabular-nums leading-none ${valueColor}`}>
            {value}
          </div>
          <p className="text-[12px] text-ink-muted mt-2">{caption}</p>
        </div>
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center shrink-0"
          style={{ background: iconBg, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 10px ${iconColor}33` }}
        >
          <span style={{ color: iconColor }}>{icon}</span>
        </div>
      </div>
      {/* vs last month line */}
      <div className="mt-4 flex items-center gap-1.5">
        {delta == null ? (
          <span className="text-[12px] text-ink-muted">No prior month data</span>
        ) : (
          <>
            <DeltaChip delta={delta} invert={invertDelta} />
            <span className="text-[12px] text-ink-muted ml-1">vs last month</span>
          </>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RepTrackingPage() {
  const { data, isLoading, error } = useQuery<RepTrackingData>({
    queryKey:        ["rep-tracking"],
    queryFn:         fetchRepTracking,
    refetchInterval: 60_000,
  })

  const account     = data?.account
  const reps        = data?.reps ?? []
  const topPerformer = data?.top_performer

  // Sort reps by revenue desc for the table
  const sortedReps = [...reps].sort((a, b) => b.revenue_recovered - a.revenue_recovered)

  // Find max values for proportional bar scaling
  const maxRevenue   = Math.max(...sortedReps.map((r) => r.revenue_recovered), 1)
  const maxRespSecs  = Math.max(...sortedReps.map((r) => r.response_time_seconds ?? 0), 1)

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{
            background: "linear-gradient(180deg, rgba(186,230,253,0.95) 0%, rgba(125,211,252,0.85) 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 12px rgba(14,165,233,0.22)",
          }}
        >
          <User className="w-6 h-6 text-sky-600" strokeWidth={2.25} fill="currentColor" />
        </div>
        <div>
          <h1 className="text-[28px] md:text-[32px] font-bold text-ink tracking-tight leading-none">
            Sales Rep Tracking
          </h1>
          <p className="text-[14px] text-ink-soft mt-2 leading-relaxed">
            Per-rep ₹ recovered, Grade A response time,<br />
            follow-up completion.
          </p>
        </div>
      </div>

      {/* ── Top stats — 3 cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* ₹ Recovered (mint) */}
        <StatCard
          label="₹ Recovered"
          value={isLoading ? <Skeleton className="h-9 w-32" /> : `₹${formatINR(account?.revenue_recovered ?? 0)}`}
          caption="This month"
          delta={account?.revenue_recovered_pct_change ?? null}
          deltaPositive={true}
          iconColor="#10B981"
          iconBg="linear-gradient(180deg, rgba(167,243,208,0.85) 0%, rgba(110,231,183,0.65) 100%)"
          icon={<IndianRupee className="w-7 h-7" strokeWidth={2.5} />}
          valueColor="text-emerald-600"
        />

        {/* Grade A Response Time (sky) */}
        <StatCard
          label="Grade A Response Time"
          value={isLoading ? <Skeleton className="h-9 w-32" /> : formatResponseTime(account?.avg_response_time_seconds ?? null)}
          caption="Average"
          delta={account?.avg_response_time_pct_change ?? null}
          deltaPositive={false}
          invertDelta
          iconColor="#0EA5E9"
          iconBg="linear-gradient(180deg, rgba(186,230,253,0.85) 0%, rgba(125,211,252,0.65) 100%)"
          icon={<Clock className="w-7 h-7" strokeWidth={2.25} />}
          valueColor="text-sky-600"
        />

        {/* Follow-up Completion (violet) */}
        <StatCard
          label="Follow-up Completion"
          value={isLoading
            ? <Skeleton className="h-9 w-24" />
            : (account?.follow_up_completion_pct == null ? "—" : `${account.follow_up_completion_pct}%`)}
          caption="Completed"
          delta={account?.follow_up_completion_pct_change ?? null}
          deltaPositive={true}
          iconColor="#8B5CF6"
          iconBg="linear-gradient(180deg, rgba(221,214,254,0.85) 0%, rgba(196,181,253,0.65) 100%)"
          icon={<CheckCircle className="w-7 h-7" strokeWidth={2.5} />}
          valueColor="text-violet-600"
        />
      </div>

      {/* ── Rep Performance Overview table ──────────────────────────────────── */}
      <div className="glass-2 gloss-edge rounded-2xl overflow-hidden">
        <div className="px-6 pt-5 pb-3">
          <h2 className="text-[16px] font-bold text-ink">Rep Performance Overview</h2>
        </div>

        {/* Headers */}
        <div
          className="grid grid-cols-[1.2fr_1fr_1fr_1fr_88px] gap-4 px-6 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          <span>Rep</span>
          <span>₹ Recovered</span>
          <span>Grade A Response Time</span>
          <span>Follow-up Completion</span>
          <span className="text-center">Rep Score</span>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="grid grid-cols-[1.2fr_1fr_1fr_1fr_88px] gap-4 px-6 py-4 items-center">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded-full" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <div><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-1 w-full" /></div>
                <div><Skeleton className="h-4 w-16 mb-2" /><Skeleton className="h-1 w-full" /></div>
                <div><Skeleton className="h-4 w-12 mb-2" /><Skeleton className="h-1 w-full" /></div>
                <Skeleton className="w-11 h-11 rounded-full mx-auto" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && reps.length === 0 && !error && (
          <div className="px-6 py-12 text-center">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
              style={{
                background: "linear-gradient(180deg, rgba(186,230,253,0.85) 0%, rgba(125,211,252,0.65) 100%)",
                boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 10px rgba(14,165,233,0.18)",
              }}
            >
              <User className="w-6 h-6 text-sky-600" strokeWidth={2.25} />
            </div>
            <p className="text-[14px] font-semibold text-ink">No rep activity yet</p>
            <p className="text-[12px] text-ink-muted mt-1">
              KPIs appear once reps start closing leads or completing follow-ups.
            </p>
          </div>
        )}

        {/* Rows */}
        {!isLoading && sortedReps.length > 0 && (
          <div className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {sortedReps.map((rep, idx) => {
              const fullName = `${rep.first_name} ${rep.last_name}`.trim()

              const revPct      = (rep.revenue_recovered / maxRevenue) * 100
              const respPct     = rep.response_time_seconds != null
                ? Math.max(15, 100 - (rep.response_time_seconds / maxRespSecs) * 100)
                : 0
              const fuPct       = rep.follow_up_completion_pct ?? 0

              // Color bands: top performer = mint, then sky, then peach, then red
              const revColor  = scoreColor(revPct >= 90 ? 90 : revPct >= 60 ? 70 : revPct >= 40 ? 60 : 40).bar
              const respColor = scoreColor(respPct >= 80 ? 90 : respPct >= 60 ? 70 : respPct >= 40 ? 60 : 40).bar
              const fuColor   = scoreColor(fuPct).bar

              const score = rep.rep_score ?? rep.follow_up_score ?? 0

              return (
                <div
                  key={rep.id}
                  className={`grid grid-cols-[1.2fr_1fr_1fr_1fr_88px] gap-4 px-6 py-4 items-center transition-colors hover:bg-sky-50/40 ${idx === 1 ? "bg-sky-50/40" : ""}`}
                >
                  {/* Rep */}
                  <div className="flex items-center gap-3 min-w-0">
                    <AvatarCircle seed={rep.first_name} size="md" />
                    <p className="text-[14px] font-semibold text-ink truncate">{fullName}</p>
                  </div>

                  {/* ₹ Recovered */}
                  <div>
                    <p className="text-[14px] font-semibold text-ink tabular-nums">
                      ₹{formatINR(rep.revenue_recovered)}
                    </p>
                    <PerfBar pct={revPct} color={revColor} />
                  </div>

                  {/* Response Time */}
                  <div>
                    <p className="text-[14px] font-semibold text-ink tabular-nums">
                      {formatResponseTime(rep.response_time_seconds)}
                    </p>
                    <PerfBar pct={respPct} color={respColor} />
                  </div>

                  {/* Follow-up Completion */}
                  <div>
                    <p className="text-[14px] font-semibold text-ink tabular-nums">
                      {rep.follow_up_completion_pct == null ? "—" : `${rep.follow_up_completion_pct}%`}
                    </p>
                    <PerfBar pct={fuPct} color={fuColor} />
                  </div>

                  {/* Rep Score donut + 5-component breakdown */}
                  <div className="flex flex-col items-center gap-1.5">
                    <ScoreRing score={score} />
                    {rep.rep_score_components && (
                      <RepScoreBreakdown components={rep.rep_score_components} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Top Performer card ─────────────────────────────────────────────── */}
      {!isLoading && topPerformer && topPerformer.revenue_recovered > 0 && (
        <div className="glass-2 gloss-edge rounded-2xl px-5 py-4 flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(180deg, #38BDF8 0%, #0EA5E9 100%)",
              boxShadow:  "inset 0 1px 0 rgba(255,255,255,0.45), 0 4px 12px rgba(14,165,233,0.30)",
            }}
          >
            <Trophy className="w-5 h-5 text-white" strokeWidth={2.5} fill="currentColor" />
          </div>
          <div className="flex-1">
            <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-[0.14em]">Top Performer</p>
            <p className="text-[15px] font-bold text-ink mt-0.5">
              {topPerformer.first_name} {topPerformer.last_name}
            </p>
            <p className="text-[13px] text-emerald-600 font-semibold tabular-nums mt-0.5">
              ₹{formatINR(topPerformer.revenue_recovered)} recovered this month!
            </p>
          </div>
          {/* Decorative sparkles */}
          <div className="hidden md:flex items-center gap-2">
            {[12, 8, 14].map((s, i) => (
              <span
                key={i}
                className="text-[18px]"
                style={{ opacity: 0.35 + i * 0.15, fontSize: `${s}px` }}
              >
                ✦
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="rounded-2xl px-5 py-4 text-[13px] text-red-700"
          style={{
            background: "rgba(254, 226, 226, 0.85)",
            border: "1px solid rgba(252, 165, 165, 0.55)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
          }}
        >
          Failed to load rep tracking — please refresh.
        </div>
      )}

    </div>
  )
}
