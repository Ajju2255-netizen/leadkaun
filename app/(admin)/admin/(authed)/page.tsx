import Link from "next/link"
import { AlertTriangle, ArrowRight, Sparkle } from "lucide-react"
import { getOverview } from "@/lib/admin/overview"
import { getRecentActivity } from "@/lib/admin/timeline"
import { getLatestSignups } from "@/lib/admin/business"
import { Timeline } from "./_components/Timeline"
import {
  Card, Kpi, Stat, SectionLabel, Bar, BarRow, FunnelStep, HealthPill, Dot, Pill,
  num, inr, pctOrDash, duration, ago, dateOnly, type Tone,
} from "./_components/ui"

export const dynamic = "force-dynamic"

const SEV_TONE: Record<string, Tone> = { info: "sky", warn: "amber", critical: "red" }

function greeting(): string {
  const h = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }))
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

/** ±N pts, coloured by direction. Null when there's no prior window to compare. */
function Delta({ pts }: { pts: number | null }) {
  if (pts == null) return null
  if (pts === 0) return <span className="text-[11px] text-ink-muted ml-1.5">→ flat</span>
  const up = pts > 0
  return (
    <span className={`text-[11px] font-bold ml-1.5 ${up ? "text-emerald-600" : "text-red-600"}`}>
      {up ? "↑" : "↓"} {Math.abs(pts)} pts
    </span>
  )
}

export default async function AdminOverview() {
  const [o, activity, latestSignups] = await Promise.all([
    getOverview(), getRecentActivity(18), getLatestSignups(6),
  ])
  const { kpis: k, intelligence: intel, intake, healthDistribution: hd } = o

  // "New" enough that someone should still be reacting to it.
  const d7 = Date.now() - 7 * 86_400_000
  const freshCount = latestSignups.filter((s) => s.createdAt.getTime() >= d7).length

  const systemsOk =
    o.health.db && o.health.jobs !== false && o.health.imports !== false && o.health.email !== false
  const criticals = o.attention.filter((a) => a.severity === "critical").length

  return (
    <div className="space-y-9">
      {/* ── Opening line: the state of the business in one sentence ── */}
      <div>
        <h1 className="text-[26px] font-black tracking-tight text-ink">{greeting()}.</h1>
        <p className="text-[14px] text-ink-soft mt-1.5">
          {systemsOk && criticals === 0
            ? "Leadkaun is healthy."
            : criticals > 0
              ? `${criticals} thing${criticals === 1 ? "" : "s"} need${criticals === 1 ? "s" : ""} your attention.`
              : "Systems are up, with a few things worth a look."}
          {" · "}
          <span className="text-ink font-semibold tabular-nums">{num(k.activeWorkspaces)}</span> active workspaces
          {" · "}
          <span className="text-ink font-semibold tabular-nums">{num(k.activeLeads)}</span> active leads
          {" · "}
          <span className="text-ink font-semibold tabular-nums">{inr(k.mrrInr)}</span> MRR
        </p>
      </div>

      {/* ── Three columns: customers / product / intelligence ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Accounts" value={num(k.accounts)} tone="sky" href="/admin/accounts"
          sub={`${num(k.newSignups7d)} new this week`}
          hint="Every Account row, regardless of plan or activity."
        />
        <Kpi
          label="Activated" value={num(k.activated)} tone="emerald" href="/admin/growth/activation"
          sub={k.accounts > 0 ? `${Math.round((k.activated / k.accounts) * 100)}% of accounts` : undefined}
          hint="Completed an import AND logged a real (non-import) rep action."
        />
        <Kpi
          label="Active leads" value={num(k.activeLeads)} tone="sky" href="/admin/leads"
          sub={`${num(k.totalLeads)} all time`}
          hint="Open leads — not won, lost, or junked. This is what plan limits meter."
        />
        <Kpi
          label="MRR" value={inr(k.mrrInr)} tone="emerald" href="/admin/billing"
          sub="active subscriptions only"
          hint="Σ subscriptions.mrr_inr where status = active, converted from paise."
        />
      </div>

      {/* ── Latest signups: a new customer should never be just a number ── */}
      <section>
        <SectionLabel
          right={<Link href="/admin/business" className="text-sky-600 font-semibold hover:text-sky-700">business scorecard →</Link>}
        >
          Latest signups
          {freshCount > 0 && <span className="text-sky-600"> · {freshCount} this week</span>}
        </SectionLabel>
        {latestSignups.length === 0 ? (
          <Card><p className="text-[13px] text-ink-muted">No accounts yet.</p></Card>
        ) : (
          <div className="rounded-2xl glass-2 divide-y divide-hairline overflow-hidden">
            {latestSignups.map((s) => {
              const fresh = s.createdAt.getTime() >= d7
              return (
                <Link
                  key={s.id}
                  href={`/admin/accounts/${s.id}`}
                  className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-sky-50/60 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {fresh
                      ? <Sparkle className="w-4 h-4 text-sky-500 shrink-0" strokeWidth={2.4} />
                      : <span className="w-4 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-ink truncate">
                        {s.name}
                        <span className="text-[11px] font-normal text-ink-muted ml-2">
                          {[s.industry, s.city].filter(Boolean).join(" · ")}
                        </span>
                      </p>
                      <p className="text-[11px] text-ink-muted truncate">
                        {s.ownerEmail ?? "no admin user"}
                        {s.source && <span className="text-ink-faint"> · via {s.source}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    {s.isPaid
                      ? <Pill tone="emerald">{s.planName}</Pill>
                      : <Pill tone="slate">{s.planName}</Pill>}
                    {s.activated
                      ? <Pill tone="emerald">activated</Pill>
                      : <Pill tone="amber">not activated</Pill>}
                    <span className="text-[11px] text-ink-muted tabular-nums whitespace-nowrap w-24 text-right">
                      {fresh ? ago(s.createdAt) : dateOnly(s.createdAt)}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Attention required ── */}
      <section>
        <SectionLabel right={o.attention.length > 0 ? `${o.attention.length} item${o.attention.length === 1 ? "" : "s"}` : undefined}>
          Attention required
        </SectionLabel>
        {o.attention.length === 0 ? (
          <Card>
            <p className="text-[13px] text-emerald-700 font-semibold">All quiet — nothing crossed a threshold.</p>
            <p className="text-[12px] text-ink-muted mt-1">
              Checked: churn risk, plan limits, seats, failed imports, stalled intakes, onboarding, RAR trend,
              job health, email delivery, Sheets connections.
            </p>
          </Card>
        ) : (
          <div className="rounded-2xl glass-2 divide-y divide-hairline overflow-hidden">
            {o.attention.map((a, i) => {
              const inner = (
                <div className="px-5 py-3 flex items-start gap-3 hover:bg-sky-50/60 transition-colors">
                  <span className="mt-[5px]"><Dot tone={SEV_TONE[a.severity]} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-ink">{a.label}</p>
                    <p className="text-[11.5px] text-ink-muted mt-0.5 leading-snug">{a.why}</p>
                  </div>
                  {a.href && <ArrowRight className="w-4 h-4 text-ink-faint shrink-0 mt-0.5" />}
                </div>
              )
              return a.href ? <Link key={i} href={a.href} className="block">{inner}</Link> : <div key={i}>{inner}</div>
            })}
          </div>
        )}
      </section>

      {/* ── System health ── */}
      <section>
        <SectionLabel right={o.jobsDelayed > 0 ? <span className="text-red-600 font-semibold">{o.jobsDelayed} job(s) delayed</span> : undefined}>
          System health
        </SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          <HealthPill label="Database" state={o.health.db} />
          <HealthPill label="Imports" state={o.health.imports} note="none today" />
          <HealthPill label="Intake" state={o.health.intake} note="no sessions" />
          <HealthPill label="Scoring" state={o.health.scoring} note="no re-scores" />
          <HealthPill label="Recommendations" state={o.health.recommendations} note="no events" />
          <HealthPill label="Email" state={o.health.email} note="none sent" />
          <HealthPill label="Jobs" state={o.health.jobs} note="no runs" />
        </div>
        <p className="text-[11px] text-ink-faint mt-2">
          Grey means <span className="font-semibold">no data to judge</span>, not failure — an unmeasured system is
          never shown as broken.
        </p>
      </section>

      {/* ── Activation funnel ── */}
      <section>
        <SectionLabel right="all accounts, all time">Activation funnel</SectionLabel>
        <Card>
          <div className="space-y-3">
            {o.activation.map((s) => (
              <div key={s.label}>
                <FunnelStep label={s.label} count={s.count} pctOfTop={s.pctOfTop} dropPct={s.dropPct} href={s.href} />
                <p className="text-[10.5px] text-ink-faint mt-1">{s.hint}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* ── Intelligence + Intake side by side ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <SectionLabel right={<Link href="/admin/recommendations" className="text-sky-600 font-semibold hover:text-sky-700">details →</Link>}>
            Intelligence · last 30 days
          </SectionLabel>
          <Card>
            {intel.isEmpty ? (
              <p className="text-[13px] text-ink-muted">
                No recommendation has been shown in the last 30 days — RAR has no denominator yet.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] text-ink-soft">RAR <span className="text-ink-faint">(accepted / shown)</span></span>
                  <span className="text-[20px] font-black tabular-nums text-sky-600">
                    {pctOrDash(intel.rates.rar)}<Delta pts={intel.rarDeltaPts} />
                  </span>
                </div>
                <Bar pct={intel.rates.rar ?? 0} tone="sky" height="h-2.5" />
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <Stat label="Expand rate" value={pctOrDash(intel.rates.expandRate)} tone="sky" sub="opened the why" />
                  <Stat label="Execution" value={pctOrDash(intel.rates.executionRate)} tone="sky" sub="acted / accepted" />
                  <Stat label="Positive" value={pctOrDash(intel.rates.positiveOutcomeRate)} tone="emerald" sub="won / outcomes" />
                </div>
                <p className="text-[11px] text-ink-muted pt-1">
                  {num(intel.counts.shown)} shown · {num(intel.counts.expanded)} expanded ·{" "}
                  {num(intel.counts.accepted)} accepted · {num(intel.counts.ignored)} ignored
                </p>
              </div>
            )}
          </Card>
        </section>

        <section>
          <SectionLabel right={<Link href="/admin/intake/analytics" className="text-sky-600 font-semibold hover:text-sky-700">details →</Link>}>
            Intake · last {intake.windowDays} days
          </SectionLabel>
          <Card>
            {intake.sessionsWindow === 0 ? (
              <p className="text-[13px] text-ink-muted">No intake sessions in this window.</p>
            ) : (
              <div className="space-y-2.5">
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Sessions today" value={num(intake.sessionsToday)} />
                  <Stat label="Approval rate" value={pctOrDash(intake.approvalRatePct)} tone="emerald" sub="approved / viewed" />
                  <Stat label="Median TTT" value={duration(intake.medianTttMs)} tone="sky" sub="upload → approved" />
                </div>
                <div className="pt-1 space-y-1.5 text-[12px]">
                  <div className="flex justify-between gap-3">
                    <span className="text-ink-soft">Top missing field</span>
                    <span className="text-ink font-semibold">
                      {intake.topMissingField ? `${intake.topMissingField.field} · ${intake.topMissingField.pct}%` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-ink-soft">Top abandonment reason</span>
                    <span className="text-ink font-semibold">
                      {intake.topAbandonReason ? `${intake.topAbandonReason.label} · ${intake.topAbandonReason.count}` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-ink-soft">Median analysis time</span>
                    <span className="text-ink font-semibold">{duration(intake.medianAnalysisMs)}</span>
                  </div>
                </div>
                {(intake.failedWindow > 0 || intake.stalled > 0) && (
                  <p className="text-[11.5px] text-orange-600 font-semibold flex items-center gap-1.5 pt-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {intake.failedWindow} failed · {intake.stalled} stalled
                  </p>
                )}
              </div>
            )}
          </Card>
        </section>
      </div>

      {/* ── Customer health + today ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <SectionLabel right={`${num(hd.total)} accounts`}>Customer health</SectionLabel>
          <Card>
            <div className="space-y-2.5">
              <BarRow label={<span className="flex items-center gap-2"><Dot tone="emerald" />Healthy</span>}
                count={hd.healthy} pct={hd.total ? Math.round((hd.healthy / hd.total) * 100) : 0} tone="emerald" />
              <BarRow label={<span className="flex items-center gap-2"><Dot tone="amber" />Needs attention</span>}
                count={hd.warning} pct={hd.total ? Math.round((hd.warning / hd.total) * 100) : 0} tone="amber" />
              <BarRow label={<span className="flex items-center gap-2"><Dot tone="red" />At risk</span>}
                count={hd.critical} pct={hd.total ? Math.round((hd.critical / hd.total) * 100) : 0} tone="red" />
            </div>
            <p className="text-[11px] text-ink-faint mt-3 leading-snug">
              Band from lead volume + recency of the last signal: healthy ≤7d, needs attention ≤14d, at risk beyond
              that or with no leads. The full weighted score, with its evidence, is on each Account 360.
            </p>
          </Card>
        </section>

        <section>
          <SectionLabel right="since 00:00 IST">Today</SectionLabel>
          <div className="grid grid-cols-3 gap-2.5">
            <Stat label="Signups" value={num(o.today.signups)} />
            <Stat label="Active accounts" value={num(o.today.activeAccounts)} sub="logged a signal" />
            <Stat label="Intake sessions" value={num(o.today.intakeSessions)} />
            <Stat label="Imports" value={num(o.today.imports)} />
            <Stat label="Leads imported" value={num(o.today.leadsImported)} />
            <Stat label="Emails sent" value={num(o.today.emails)} />
          </div>
        </section>
      </div>

      {/* ── Recent activity ── */}
      <section>
        <SectionLabel right={<Pill tone="sky">account events</Pill>}>Recent activity</SectionLabel>
        <Card>
          <Timeline events={activity} showAccount />
        </Card>
      </section>
    </div>
  )
}
