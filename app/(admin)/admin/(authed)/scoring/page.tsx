import { Fragment } from "react"
import Link from "next/link"
import { getScoringMonitor, getScopeOptions, type ScoringFilters } from "@/lib/admin/scoring"
import { FilterBar, type SelectFilter } from "../_components/FilterBar"
import {
  PageHeader, Card, Stat, SectionLabel, Bar, BarRow, Grade, EmptyState,
  TableWrap, THead, TBody, Th, Td, Tr, num,
} from "../_components/ui"

export const dynamic = "force-dynamic"

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined

const GRADE_TONE = { A: "emerald", B: "sky", C: "amber", D: "amber", E: "red", F: "slate" } as const

export default async function ScoringPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const f: ScoringFilters = {
    accountId: one(searchParams.account),
    sourceKey: one(searchParams.source),
    days: one(searchParams.days) ? Number(one(searchParams.days)) : undefined,
    openOnly: one(searchParams.scope) === "open",
  }
  const [m, scope] = await Promise.all([getScoringMonitor(f), getScopeOptions()])

  const filters: SelectFilter[] = [
    { param: "account", label: "All accounts", options: scope.accounts.map((a) => ({ value: a.id, label: a.name })) },
    { param: "source", label: "All sources", options: scope.sources.map((s) => ({ value: s.key, label: s.name })) },
    {
      param: "days", label: "All time",
      options: [
        { value: "7", label: "Imported last 7d" },
        { value: "30", label: "Imported last 30d" },
        { value: "90", label: "Imported last 90d" },
      ],
    },
    { param: "scope", label: "All leads", options: [{ value: "open", label: "Open leads only" }] },
  ]

  const maxBand = Math.max(1, ...m.bands.flatMap((b) => [b.fit, b.intent, b.quality]))

  return (
    <div className="space-y-7">
      <PageHeader
        title="Scoring"
        subtitle="Is the engine grading sensibly? Grade A–F is a threshold matrix over three independent 0–100 dimensions — Fit × Intent × Quality — not a single blend."
        right={<span className="text-[12px] text-ink-muted tabular-nums">{num(m.total)} leads in scope</span>}
      />

      <FilterBar filters={filters} showSearch={false} />

      {m.total === 0 ? (
        <Card><EmptyState>No leads in this scope.</EmptyState></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Stat label="Avg fit" value={m.averages.fit == null ? "—" : String(m.averages.fit)} tone="sky" />
            <Stat label="Avg intent" value={m.averages.intent == null ? "—" : String(m.averages.intent)} tone="emerald" />
            <Stat label="Avg quality" value={m.averages.quality == null ? "—" : String(m.averages.quality)} tone="amber" />
            <Stat label="SQL leads" value={num(m.sqlCount)} tone="emerald" sub={`${Math.round((m.sqlCount / m.total) * 100)}% of scope`} />
            <Stat label="Never re-graded" value={num(m.neverRegraded)} sub={`${num(m.regradedLast7d)} changed in 7d`} />
          </div>

          {/* ── Grade distribution ── */}
          <section>
            <SectionLabel right="F is forced whenever quality < 20, before any other rule">Grade distribution</SectionLabel>
            <Card>
              <div className="space-y-2">
                {m.grades.map((g) => (
                  <div key={g.grade} className="flex items-center gap-3">
                    <Grade grade={g.grade} />
                    <div className="flex-1"><Bar pct={g.pct} tone={GRADE_TONE[g.grade]} height="h-2.5" /></div>
                    <span className="text-[12px] tabular-nums text-ink-soft w-28 text-right">{num(g.count)} · {g.pct}%</span>
                  </div>
                ))}
              </div>
            </Card>
          </section>

          {/* ── Unknown vs bad ── */}
          <section>
            <SectionLabel right="Law 1 · Unknown ≠ Negative">Why the low grades are low</SectionLabel>
            <Card>
              {m.lowGrade.total === 0 ? (
                <p className="text-[13px] text-emerald-700 font-semibold">No leads at grade D, E or F in this scope.</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                    <Stat
                      label="Thin data" value={num(m.lowGrade.thinData)} tone="amber"
                      sub={`${m.lowGrade.thinPct ?? 0}% of low grades`}
                    />
                    <Stat label="Known mismatch" value={num(m.lowGrade.knownMismatch)} sub="we know enough; it isn't a fit" />
                    <Stat label="Flagged junk" value={num(m.lowGrade.junk)} sub="explicitly marked" />
                  </div>
                  <p className="text-[12px] text-ink-soft leading-relaxed">
                    The engine never subtracts for a mismatch — an unknown field simply scores 0. But a lead with
                    <em> nothing</em> known still lands at the bottom by having no points, which is indistinguishable
                    from a genuinely poor lead in a grade histogram. Of {num(m.lowGrade.total)} low-graded leads,{" "}
                    <span className="font-bold text-ink">{num(m.lowGrade.thinData)}</span> have no company, no role,
                    no location and no deal value — those are <span className="font-bold text-ink">unknown</span>, and
                    the fix is enrichment, not a scoring change.
                  </p>
                </>
              )}
            </Card>
          </section>

          {/* ── Component distributions ── */}
          <section>
            <SectionLabel right="how each 0–100 dimension is spread">Score components</SectionLabel>
            <Card>
              <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-4 gap-y-2 items-center">
                <span />
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-sky-600 text-center">Fit</span>
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-600 text-center">Intent</span>
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-orange-600 text-center">Quality</span>
                {m.bands.map((b) => (
                  <Fragment key={b.label}>
                    <span className="text-[11.5px] font-mono text-ink-muted whitespace-nowrap">{b.label}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex-1"><Bar pct={(b.fit / maxBand) * 100} tone="sky" /></div>
                      <span className="text-[11px] tabular-nums text-ink-muted w-12 text-right">{num(b.fit)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1"><Bar pct={(b.intent / maxBand) * 100} tone="emerald" /></div>
                      <span className="text-[11px] tabular-nums text-ink-muted w-12 text-right">{num(b.intent)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1"><Bar pct={(b.quality / maxBand) * 100} tone="amber" /></div>
                      <span className="text-[11px] tabular-nums text-ink-muted w-12 text-right">{num(b.quality)}</span>
                    </div>
                  </Fragment>
                ))}
              </div>
            </Card>
          </section>

          {/* ── Fit inputs ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section>
              <SectionLabel right="lowest coverage first">Fit input coverage</SectionLabel>
              <Card>
                <div className="space-y-2">
                  {m.fitInputs.map((r) => (
                    <BarRow key={r.field} label={r.field} count={r.known} pct={r.pct} tone={r.pct >= 60 ? "emerald" : r.pct >= 30 ? "amber" : "red"} />
                  ))}
                </div>
                <p className="text-[10.5px] text-ink-faint mt-3 leading-snug">
                  These are the fields fit and quality are computed from. Low coverage here caps how high any grade
                  can go, no matter how good the leads actually are.
                </p>
              </Card>
            </section>

            <section>
              <SectionLabel right="fit falls back to a flat 38 without an ICP">ICP coverage</SectionLabel>
              <Card>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Stat
                    label="Accounts with ICP" value={`${m.icpCoverage.accountsWithIcp} / ${m.icpCoverage.accountsTotal}`}
                    tone={m.icpCoverage.accountsWithIcp === m.icpCoverage.accountsTotal ? "emerald" : "amber"}
                  />
                  <Stat
                    label="Leads with no ICP" value={num(m.icpCoverage.leadsWithoutIcp)}
                    tone={m.icpCoverage.leadsWithoutIcp > 0 ? "amber" : "emerald"}
                    sub="graded against a flat baseline"
                  />
                </div>
                <p className="text-[12px] text-ink-soft leading-relaxed">
                  When an account has not configured an ICP, <code className="text-ink-muted">computeFitScore</code>{" "}
                  short-circuits to a fixed baseline totalling 38 — every lead sits near grade D regardless of merit.
                  Those leads are not badly scored; they are unscored.
                </p>
              </Card>
            </section>
          </div>

          {/* ── Grade movement ── */}
          <section>
            <SectionLabel right="last 7 days">Grade movement</SectionLabel>
            {m.gradeChanges7d.length === 0 ? (
              <Card><p className="text-[13px] text-ink-muted">No grade changed in the last 7 days in this scope.</p></Card>
            ) : (
              <Card>
                <div className="flex flex-wrap gap-2">
                  {m.gradeChanges7d.map((c) => {
                    const down = c.from < c.to // "A" < "B" — later letter is worse
                    return (
                      <span key={`${c.from}-${c.to}`} className="inline-flex items-center gap-1.5 rounded-xl glass-1 px-3 py-1.5">
                        <Grade grade={c.from} />
                        <span className={down ? "text-red-500" : "text-emerald-500"}>→</span>
                        <Grade grade={c.to} />
                        <span className="text-[12px] tabular-nums text-ink-soft font-semibold ml-1">{num(c.count)}</span>
                      </span>
                    )
                  })}
                </div>
                <p className="text-[10.5px] text-ink-faint mt-3">
                  Downgrades are usually the nightly intent-decay job (02:00 IST) doing its job on leads nobody has
                  touched. A burst of upgrades usually follows an ICP change.
                </p>
              </Card>
            )}
          </section>

          {/* ── By source ── */}
          <section>
            <SectionLabel right="intent baseline seeds every lead from that source">Scoring by source</SectionLabel>
            <TableWrap>
              <table className="w-full text-left min-w-[620px]">
                <THead>
                  <Th>Source</Th>
                  <Th className="text-right">Leads</Th>
                  <Th className="text-right">Avg fit</Th>
                  <Th className="text-right">Avg intent</Th>
                  <Th className="text-right">Avg quality</Th>
                  <Th className="text-right">Grade A</Th>
                </THead>
                <TBody>
                  {m.bySource.length === 0 ? (
                    <tr><td colSpan={6}><EmptyState>No sources with leads in this scope.</EmptyState></td></tr>
                  ) : m.bySource.map((s) => (
                    <Tr key={s.source}>
                      <Td className="font-semibold text-ink">{s.source}</Td>
                      <Td className="text-right tabular-nums">{num(s.count)}</Td>
                      <Td className="text-right tabular-nums">{s.avgFit}</Td>
                      <Td className="text-right tabular-nums">{s.avgIntent}</Td>
                      <Td className="text-right tabular-nums">{s.avgQuality}</Td>
                      <Td className="text-right tabular-nums">
                        {s.aPct > 0 ? <span className="text-emerald-600 font-semibold">{s.aPct}%</span> : <span className="text-ink-faint">0%</span>}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </table>
            </TableWrap>
          </section>

          <p className="text-[11px] text-ink-faint">
            To audit a single lead&rsquo;s grade — every component, the ladder used, and a live re-computation —
            open it from <Link href="/admin/leads" className="text-sky-600 font-semibold hover:text-sky-700">Leads</Link>.
          </p>
        </>
      )}
    </div>
  )
}
