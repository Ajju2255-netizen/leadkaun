import { getIntakeAnalytics, REPORT_SCAN_CAP } from "@/lib/admin/intake"
import { FilterBar, type SelectFilter } from "../../_components/FilterBar"
import {
  PageHeader, Card, Stat, SectionLabel, BarRow, FunnelStep, EmptyState,
  num, duration, pctOrDash, BackLink,
} from "../../_components/ui"

export const metadata = { title: "Intake analytics" }

export const dynamic = "force-dynamic"

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined

const WINDOW: SelectFilter[] = [
  {
    param: "days", label: "Last 30 days",
    options: [
      { value: "7", label: "Last 7 days" },
      { value: "30", label: "Last 30 days" },
      { value: "90", label: "Last 90 days" },
      { value: "365", label: "Last year" },
    ],
  },
]

export default async function IntakeAnalyticsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const days = Number(one(searchParams.days) ?? 30) || 30
  const a = await getIntakeAnalytics(days)
  const t = a.totals

  const funnel = [
    { label: "Sessions started", count: t.sessions, hint: "A dataset was uploaded and analysis began." },
    { label: "Report read", count: t.viewed, hint: "The customer actually opened the Import Intelligence Report." },
    { label: "Approved", count: t.approved, hint: "They clicked through to import. This is the trust moment." },
    { label: "Import completed", count: t.completed, hint: "Leads are in the product." },
  ]
  const top = funnel[0].count || 1

  return (
    <div className="space-y-7">
      <PageHeader
        title="Intake analytics"
        subtitle="What the first twenty to fifty datasets are telling us. Time-to-Trust, where customers stop, and what real Indian SMB lead lists actually contain."
        right={
          <BackLink href="/intake">All sessions</BackLink>
        }
      />

      <FilterBar filters={WINDOW} showSearch={false} />

      {t.sessions === 0 ? (
        <Card><EmptyState>No intake sessions in the last {days} days.</EmptyState></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Stat label="Sessions" value={num(t.sessions)} />
            <Stat label="Report read" value={pctOrDash(a.viewRatePct)} sub={`${num(t.viewed)} of ${num(t.sessions)}`} />
            <Stat label="Approval rate" value={pctOrDash(a.approvalRatePct)} tone="emerald" sub="approved / read" />
            <Stat label="Import completion" value={pctOrDash(a.completionRatePct)} sub="completed / approved" />
            <Stat label="Dropped" value={num(t.dropped)} tone={t.dropped > 0 ? "amber" : "slate"} sub="abandoned or cancelled" />
            <Stat label="Failed" value={num(t.failed)} tone={t.failed > 0 ? "red" : "slate"} />
          </div>

          {/* ── Funnel ── */}
          <section>
            <SectionLabel right="upload → leads in the product">Intake funnel</SectionLabel>
            <Card>
              <div className="space-y-3">
                {funnel.map((f, i) => {
                  const prev = i > 0 ? funnel[i - 1].count : f.count
                  return (
                    <div key={f.label}>
                      <FunnelStep
                        label={f.label}
                        count={f.count}
                        pctOfTop={Math.round((f.count / top) * 100)}
                        dropPct={i > 0 && prev > 0 ? Math.round(((prev - f.count) / prev) * 100) : null}
                      />
                      <p className="text-[10.5px] text-ink-faint mt-1">{f.hint}</p>
                    </div>
                  )
                })}
              </div>
            </Card>
          </section>

          {/* ── Time to Trust ── */}
          <section>
            <SectionLabel right="medians, not means — one slow session shouldn't move the number">
              Time to Trust
            </SectionLabel>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Upload → analysis" value={duration(a.ttt.uploadToAnalysis)} tone="sky" sub={`n=${a.ttt.n.uploadToAnalysis}`} />
              <Stat label="Analysis → report read" value={duration(a.ttt.analysisToView)} tone="sky" sub={`n=${a.ttt.n.analysisToView}`} />
              <Stat label="Report read → approval" value={duration(a.ttt.viewToApproval)} tone="sky" sub={`n=${a.ttt.n.viewToApproval}`} />
              <Stat label="Total TTT" value={duration(a.ttt.total)} tone="emerald" sub={`n=${a.ttt.n.total}`} />
            </div>
            <p className="text-[11px] text-ink-faint mt-2 leading-snug">
              Only the first leg is our latency. The second is how long they hesitated before opening the report; the
              third is how long the report took to convince them. Those two are the product problem worth solving.
            </p>
          </section>

          {/* ── What datasets are missing ── */}
          <section>
            <SectionLabel right={`across ${num(a.scanned)} report snapshots${a.scanCapped ? ` (capped at ${REPORT_SCAN_CAP})` : ""}`}>
              What real lead lists are missing
            </SectionLabel>
            <Card>
              {a.missingFields.length === 0 ? (
                <p className="text-[13px] text-emerald-700 font-semibold">No dataset in this window was flagged as missing a field.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {a.missingFields.slice(0, 12).map((m) => (
                      <BarRow key={m.field} label={m.field} count={m.count} pct={m.pct} tone={m.pct >= 50 ? "red" : m.pct >= 25 ? "amber" : "sky"} />
                    ))}
                  </div>
                  <p className="text-[10.5px] text-ink-faint mt-3 leading-snug">
                    Read as: &ldquo;{a.missingFields[0].pct}% of imported datasets have no {a.missingFields[0].field}.&rdquo;
                    This is the evidence behind any enrichment decision — it says what the market actually has, not
                    what we assumed it has.
                  </p>
                </>
              )}
            </Card>
          </section>

          {/* ── Composition ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section>
              <SectionLabel>Business type detected</SectionLabel>
              <Card>
                {a.businessTypes.length === 0 ? <p className="text-[13px] text-ink-muted">Nothing recorded.</p> : (
                  <div className="space-y-2">
                    {a.businessTypes.map((b) => (
                      <BarRow key={b.key} label={b.label} count={b.count} pct={b.pct} tone={b.key === "unknown" ? "slate" : "sky"} />
                    ))}
                  </div>
                )}
              </Card>
            </section>

            <section>
              <SectionLabel>Upload source</SectionLabel>
              <Card>
                <div className="space-y-2">
                  {a.sources.map((s) => <BarRow key={s.key} label={s.label} count={s.count} pct={s.pct} tone="sky" />)}
                </div>
              </Card>
            </section>

            <section>
              <SectionLabel>Readiness shown</SectionLabel>
              <Card>
                {a.readiness.length === 0 ? <p className="text-[13px] text-ink-muted">Nothing recorded.</p> : (
                  <div className="space-y-2">
                    {a.readiness.map((r) => (
                      <BarRow
                        key={r.key} label={r.label} count={r.count} pct={r.pct}
                        tone={r.key === "High" ? "emerald" : r.key === "Medium" ? "sky" : "amber"}
                      />
                    ))}
                  </div>
                )}
                {a.avgDuplicatePct != null && (
                  <p className="text-[11.5px] text-ink-soft mt-3">
                    Mean estimated duplicate rate: <span className="font-bold text-ink">{a.avgDuplicatePct}%</span>
                  </p>
                )}
              </Card>
            </section>
          </div>

          {/* ── Where it ends ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section>
              <SectionLabel right="the single most useful product-research dataset here">
                Why customers walked away
              </SectionLabel>
              <Card>
                {a.abandonReasons.length === 0 ? (
                  <p className="text-[13px] text-ink-muted">
                    {t.dropped === 0
                      ? "Nobody abandoned or cancelled in this window."
                      : `${num(t.dropped)} session(s) ended without importing, but none recorded a reason — the reason prompt only fires on an explicit cancel.`}
                  </p>
                ) : (
                  <>
                    <div className="space-y-2">
                      {a.abandonReasons.map((r) => (
                        <BarRow key={r.key} label={r.label} count={r.count} pct={r.pct} tone="amber" />
                      ))}
                    </div>
                    <p className="text-[10.5px] text-ink-faint mt-3">
                      Percentages are of the {num(t.dropped)} dropped sessions, not of all sessions.
                    </p>
                  </>
                )}
              </Card>
            </section>

            <section>
              <SectionLabel right="where sessions currently sit">State distribution</SectionLabel>
              <Card>
                <div className="space-y-2">
                  {a.states.map((s) => (
                    <BarRow
                      key={s.key} label={s.label} count={s.count} pct={s.pct}
                      tone={s.key === "COMPLETED" ? "emerald" : s.key === "FAILED" ? "red" : ["ABANDONED", "CANCELLED"].includes(s.key) ? "amber" : "sky"}
                    />
                  ))}
                </div>
              </Card>
            </section>
          </div>

          {/* ── Engine versions ── */}
          <section>
            <SectionLabel right="a mix means results in this window aren't directly comparable">
              Engine versions in this window
            </SectionLabel>
            <Card>
              <div className="space-y-2">
                {a.engineVersions.map((e) => (
                  <BarRow key={e.key} label={<span className="font-mono">{e.label}</span>} count={e.count} pct={e.pct} tone="violet" />
                ))}
              </div>
              {a.engineVersions.length > 1 && (
                <p className="text-[11.5px] text-orange-600 font-semibold mt-3">
                  {a.engineVersions.length} engine versions produced the reports in this window — a shift in approval
                  rate could be the engine changing rather than the customers.
                </p>
              )}
            </Card>
          </section>
        </>
      )}
    </div>
  )
}
