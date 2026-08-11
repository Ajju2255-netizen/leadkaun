import Link from "next/link"
import { getRecommendationIntelligence } from "@/lib/admin/recommendations"
import { FilterBar, type SelectFilter } from "../_components/FilterBar"
import {
  PageHeader, Card, Stat, SectionLabel, Bar, BarRow, Grade, Pill, EmptyState,
  TableWrap, THead, TBody, Th, Td, Tr, num, pctOrDash,
} from "../_components/ui"

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

/** One stage of the funnel, with the conversion from the stage above it. */
function FunnelBand({ label, count, top, prev, note }: { label: string; count: number; top: number; prev: number | null; note: string }) {
  const pct = top > 0 ? Math.round((count / top) * 100) : 0
  const conv = prev != null && prev > 0 ? Math.round((count / prev) * 100) : null
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="text-[12.5px] font-semibold text-ink-soft">{label}</span>
        <span className="tabular-nums text-[12px]">
          <span className="text-ink font-bold">{num(count)}</span>
          <span className="text-ink-muted"> · {pct}% of shown</span>
          {conv != null && <span className="text-sky-600 font-semibold ml-2">{conv}% of previous</span>}
        </span>
      </div>
      <Bar pct={pct} tone="sky" height="h-3" />
      <p className="text-[10.5px] text-ink-faint mt-1">{note}</p>
    </div>
  )
}

export default async function RecommendationsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const days = Number(one(searchParams.days) ?? 30) || 30
  const r = await getRecommendationIntelligence(days)
  const c = r.counts

  return (
    <div className="space-y-7">
      <PageHeader
        title="Recommendations"
        subtitle="Does the product's advice get followed? RAR — Recommendation Acceptance Rate, accepted ÷ shown — is the north star. Every rate below returns a dash rather than 0% when it has no denominator."
        right={<span className="text-[12px] text-ink-muted tabular-nums">{num(c.shown)} shown in window</span>}
      />

      <FilterBar filters={WINDOW} showSearch={false} />

      {r.isEmpty ? (
        <Card>
          <p className="text-[13px] text-ink-soft font-semibold">No recommendation telemetry in the last {days} days.</p>
          <p className="text-[12px] text-ink-muted mt-1.5 leading-relaxed">
            SHOWN and EXPANDED are emitted client-side by <code>components/shared/RecommendationExplanation.tsx</code>;
            ACCEPTED and IGNORED come from the same component; EXECUTED is written server-side when a rep logs a
            call or WhatsApp; OUTCOME when a lead is marked won or lost. If this is empty while reps are working,
            the telemetry — not the engine — is what to check.
          </p>
        </Card>
      ) : (
        <>
          {/* ── Headline ── */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Card className="col-span-2 lg:col-span-1">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">RAR</p>
              <p className="text-[30px] font-black tabular-nums text-sky-600 leading-none mt-1">{pctOrDash(r.rates.rar)}</p>
              {r.rarDeltaPts != null && (
                <p className={`text-[11.5px] font-bold mt-1 ${r.rarDeltaPts > 0 ? "text-emerald-600" : r.rarDeltaPts < 0 ? "text-red-600" : "text-ink-muted"}`}>
                  {r.rarDeltaPts > 0 ? "↑" : r.rarDeltaPts < 0 ? "↓" : "→"} {Math.abs(r.rarDeltaPts)} pts vs previous {days}d
                  <span className="text-ink-faint font-normal"> (was {pctOrDash(r.previousRar)})</span>
                </p>
              )}
              <p className="text-[10.5px] text-ink-faint mt-1.5">accepted ÷ shown</p>
            </Card>
            <Stat label="Expand rate" value={pctOrDash(r.rates.expandRate)} tone="sky" sub="opened the 'why'" />
            <Stat label="Accept of decided" value={pctOrDash(r.rates.acceptOfDecided)} tone="sky" sub="accepted ÷ (accepted + ignored)" />
            <Stat label="Execution rate" value={pctOrDash(r.rates.executionRate)} tone="emerald" sub="executed ÷ accepted" />
            <Stat label="Positive outcome" value={pctOrDash(r.rates.positiveOutcomeRate)} tone="emerald" sub={`${num(r.outcomeWon)} won · ${num(r.outcomeLost)} lost`} />
          </div>

          {/* ── Funnel ── */}
          <section>
            <SectionLabel right="where trust is lost">Recommendation funnel</SectionLabel>
            <Card>
              <div className="space-y-4">
                <FunnelBand label="Shown" count={c.shown} top={c.shown} prev={null} note="A recommendation was rendered to a rep. This is the RAR denominator." />
                <FunnelBand label="Expanded" count={c.expanded} top={c.shown} prev={c.shown} note="The rep opened 'Why did Leadkaun recommend this?' — the clearest read on trust." />
                <FunnelBand label="Decided" count={c.accepted + c.ignored} top={c.shown} prev={c.expanded || c.shown} note="Accepted or explicitly skipped. Everything else was neither." />
                <FunnelBand label="Accepted" count={c.accepted} top={c.shown} prev={c.accepted + c.ignored} note="The rep chose to follow the recommendation." />
                <FunnelBand label="Executed" count={c.executed} top={c.shown} prev={c.accepted} note="They actually acted — a call or WhatsApp was logged against the lead." />
                <FunnelBand label="Outcome recorded" count={c.outcome} top={c.shown} prev={c.executed} note="The lead was marked won or lost after the recommendation." />
                <FunnelBand label="Positive outcome" count={r.outcomeWon} top={c.shown} prev={c.outcome} note="Won. This is the closest thing to proof the advice was right." />
              </div>
              {c.dismissed > 0 && (
                <p className="text-[11.5px] text-ink-muted mt-3">
                  {num(c.dismissed)} recommendations were dismissed outright (removed from view without a reason).
                </p>
              )}
            </Card>
          </section>

          {/* ── Failure analysis ── */}
          <section>
            <SectionLabel right={`${num(c.ignored)} skips with a reason`}>Why reps skip</SectionLabel>
            {c.ignored === 0 ? (
              <Card><p className="text-[13px] text-ink-muted">Nothing has been explicitly skipped in this window.</p></Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <div className="space-y-2.5">
                    {r.skipReasons.map((s) => (
                      <BarRow key={s.reason} label={s.label} count={s.count} pct={s.pct} tone={s.reason === "WRONG_RECOMMENDATION" ? "red" : "amber"} />
                    ))}
                  </div>
                  <p className="text-[10.5px] text-ink-faint mt-3 leading-snug">
                    Buttons only — no free text — so this is a clean dataset rather than a pile of prose.
                    &ldquo;Wrong recommendation&rdquo; is the one that indicts the engine; the rest describe context we
                    didn&rsquo;t have.
                  </p>
                </Card>

                <Card>
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-2.5">Skip reason × grade shown</p>
                  {r.failureByGrade.length === 0 ? (
                    <p className="text-[12.5px] text-ink-muted">No grade was recorded with these skips.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {r.failureByGrade.map((f) => (
                        <div key={f.reason}>
                          <p className="text-[12px] font-semibold text-ink-soft mb-1">{f.label} <span className="text-ink-faint font-normal">· {f.total}</span></p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {Object.entries(f.grades).sort(([a], [b]) => a.localeCompare(b)).map(([g, n]) => (
                              <span key={g} className="inline-flex items-center gap-1 rounded-lg glass-1 px-2 py-1">
                                <Grade grade={g} />
                                <span className="text-[11.5px] tabular-nums font-semibold text-ink-soft">{n}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[10.5px] text-ink-faint mt-3 leading-snug">
                    A reason concentrating on one grade is a research finding, not noise — e.g. &ldquo;need more
                    information&rdquo; clustering on leads with no budget points at enrichment, not at the ranking.
                  </p>
                </Card>
              </div>
            )}
          </section>

          {/* ── Slices ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section>
              <SectionLabel right="grade at the moment it was shown">Acceptance by grade</SectionLabel>
              <Card>
                {r.byGrade.length === 0 ? <p className="text-[13px] text-ink-muted">No grade recorded on these events.</p> : (
                  <div className="space-y-2">
                    {r.byGrade.map((g) => (
                      <div key={g.key} className="flex items-center gap-3">
                        {g.key === "unknown" ? <Pill tone="slate">?</Pill> : <Grade grade={g.key} />}
                        <div className="flex-1"><Bar pct={g.rar ?? 0} tone={g.rar == null ? "slate" : "sky"} /></div>
                        <span className="text-[11.5px] tabular-nums text-ink-soft w-32 text-right">
                          {pctOrDash(g.rar)} <span className="text-ink-faint">of {num(g.shown)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </section>

            <section>
              <SectionLabel right="how sure we said we were">Acceptance by confidence band</SectionLabel>
              <Card>
                {r.byConfidence.length === 0 ? <p className="text-[13px] text-ink-muted">No confidence band recorded on these events.</p> : (
                  <div className="space-y-2">
                    {r.byConfidence.map((b) => (
                      <BarRow
                        key={b.key}
                        label={b.key.replace(/_/g, " ")}
                        count={`${pctOrDash(b.rar)} of ${num(b.shown)}`}
                        pct={b.rar}
                        tone={b.rar == null ? "slate" : b.rar >= 50 ? "emerald" : "amber"}
                      />
                    ))}
                  </div>
                )}
                <p className="text-[10.5px] text-ink-faint mt-3 leading-snug">
                  If low-confidence recommendations are accepted at roughly the same rate as high-confidence ones,
                  reps aren&rsquo;t reading the confidence signal — which makes it decoration rather than information.
                </p>
              </Card>
            </section>
          </div>

          {/* ── Per account ── */}
          <section>
            <SectionLabel right="lowest trust first, among accounts with ≥10 shown">Trust by account</SectionLabel>
            <TableWrap>
              <table className="w-full text-left min-w-[680px]">
                <THead>
                  <Th>Account</Th>
                  <Th className="text-right">Shown</Th>
                  <Th className="text-right">Accepted</Th>
                  <Th className="text-right">Ignored</Th>
                  <Th className="text-right">Expand rate</Th>
                  <Th className="text-right">RAR</Th>
                </THead>
                <TBody>
                  {r.accounts.length === 0 ? (
                    <tr><td colSpan={6}><EmptyState>No account has recommendation telemetry in this window.</EmptyState></td></tr>
                  ) : r.accounts.map((a) => (
                    <Tr key={a.accountId}>
                      <Td>
                        <Link href={`/admin/accounts/${a.accountId}`} className="text-[13px] font-bold text-ink hover:text-sky-600">
                          {a.accountName}
                        </Link>
                        {a.shown < 10 && <span className="text-[10.5px] text-ink-faint ml-2">low volume</span>}
                      </Td>
                      <Td className="text-right tabular-nums">{num(a.shown)}</Td>
                      <Td className="text-right tabular-nums text-emerald-600 font-semibold">{num(a.accepted)}</Td>
                      <Td className="text-right tabular-nums text-orange-600">{num(a.ignored)}</Td>
                      <Td className="text-right tabular-nums">{pctOrDash(a.expandRate)}</Td>
                      <Td className="text-right tabular-nums font-bold text-ink">{pctOrDash(a.rar)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </table>
            </TableWrap>
          </section>
        </>
      )}
    </div>
  )
}
