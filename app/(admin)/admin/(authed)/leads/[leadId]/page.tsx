import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, AlertTriangle, Check, Minus } from "lucide-react"
import { getLeadInspector, type EvidenceEntry } from "@/lib/admin/leads"
import {
  Card, Stat, SectionLabel, Bar, Grade, Pill, EmptyState, Dot,
  TableWrap, THead, TBody, Th, Td, Tr,
  num, inr, ago, dateTime, duration, type Tone,
} from "../../_components/ui"

export const dynamic = "force-dynamic"

const FACTOR_TONE: Record<string, Tone> = { good: "emerald", ok: "sky", weak: "amber", none: "slate" }

const KIND_TONE: Record<EvidenceEntry["kind"], Tone> = {
  score: "violet", signal: "sky", note: "slate",
  recommendation: "emerald", stage: "amber", followup: "sky",
}

function ScoreBar({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">{label}</span>
        <span className="text-[15px] font-black tabular-nums text-ink">{value}</span>
      </div>
      <Bar pct={value} tone={tone} />
    </div>
  )
}

export default async function LeadInspectorPage({ params }: { params: { leadId: string } }) {
  const d = await getLeadInspector(params.leadId)
  if (!d) notFound()
  const { lead: l, explanation: ex, confidence: conf, live, icp } = d

  return (
    <div className="space-y-8">
      <Link href="/admin/leads" className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-muted hover:text-sky-600">
        <ChevronLeft className="w-4 h-4" /> Leads
      </Link>

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="mt-1"><Grade grade={l.grade} /></div>
          <div>
            <h1 className="text-[24px] font-black tracking-tight text-ink">{l.name || "(no name)"}</h1>
            <div className="flex items-center gap-2 flex-wrap text-[12px] text-ink-soft mt-1">
              <span className="font-mono">{l.phone}</span>
              {l.email && <span>· {l.email}</span>}
              {l.company && <span>· {l.company}</span>}
              {l.designation && <span>· {l.designation}</span>}
              {(l.city || l.state) && <span>· {[l.city, l.state].filter(Boolean).join(", ")}</span>}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <Link href={`/admin/accounts/${d.account.id}`}><Pill tone="sky">{d.account.name}</Pill></Link>
              {d.workspaceName && <Pill tone="slate">{d.workspaceName}</Pill>}
              {l.isSql && <Pill tone="emerald">SQL</Pill>}
              {l.isMissed && <Pill tone="red">missed</Pill>}
              {l.isJunk && <Pill tone="slate">junk</Pill>}
              {l.isFatigued && <Pill tone="amber">fatigued</Pill>}
              {l.isDuplicate && <Pill tone="amber">duplicate</Pill>}
              {l.wonAt && <Pill tone="emerald">won {inr(l.wonValue ?? 0)}</Pill>}
              {l.lostAt && <Pill tone="slate">lost</Pill>}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Next action</p>
          <p className="text-[15px] font-black text-ink">{d.nextAction.label}</p>
          <p className="text-[11px] text-ink-muted max-w-[220px]">P{d.nextAction.priority} · {d.nextAction.reason}</p>
        </div>
      </div>

      {/* ── Drift banner: stored grade vs what the engine says now ── */}
      {live.drifted && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50/70 px-5 py-3.5 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-bold text-orange-800">
              Stored grade <span className="font-mono">{l.grade}</span> · engine would grade this{" "}
              <span className="font-mono">{live.grade}</span> right now
            </p>
            <p className="text-[11.5px] text-orange-700 mt-0.5 leading-snug">
              The stored scores are a snapshot from the last re-scoring. A drift is expected right after an ICP change
              (until the regrade job finishes) — a persistent one means the lead is stale, not that the engine is wrong.
            </p>
          </div>
        </div>
      )}

      {/* ── Scores ── */}
      <section>
        <SectionLabel right={`queue score ${l.aiScore} · confidence ${conf.score}% (${conf.band.replace("_", " ")})`}>
          Scores
        </SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><ScoreBar label="Fit" value={l.fit} tone="sky" /></Card>
          <Card><ScoreBar label="Intent" value={l.intent} tone="emerald" /></Card>
          <Card><ScoreBar label="Quality" value={l.quality} tone="amber" /></Card>
        </div>
        <p className="text-[12px] text-ink-soft mt-2.5">{ex.summary}</p>
        <p className="text-[11px] text-ink-faint mt-1">
          Limiting dimension: <span className="font-bold text-ink-soft">{ex.limiting}</span>
          {ex.breakdownMissing && " · no stored breakdown on this lead (imported before breakdowns were persisted, or never re-scored)"}
        </p>
      </section>

      {/* ── Why this grade — customer view + admin view side by side ── */}
      <section>
        <SectionLabel right="left: exactly what the customer sees · right: the raw engine output">
          Why this grade
        </SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2.5">Fit factors</p>
            {ex.fit.factors.length === 0 ? (
              <p className="text-[12.5px] text-ink-muted">No stored fit breakdown.</p>
            ) : (
              <ul className="space-y-1.5">
                {ex.fit.factors.map((f) => (
                  <li key={f.key} className="flex items-center gap-2.5">
                    <Dot tone={FACTOR_TONE[f.tone]} />
                    <span className="text-[12.5px] text-ink-soft flex-1">{f.label}</span>
                    <span className="text-[11px] text-ink-muted">{f.note}</span>
                    <span className="text-[12px] tabular-nums font-bold text-ink w-12 text-right">{f.points}/{f.max}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mt-4 mb-2.5">Quality factors</p>
            {ex.quality.factors.length === 0 ? (
              <p className="text-[12.5px] text-ink-muted">No stored quality breakdown.</p>
            ) : (
              <ul className="space-y-1.5">
                {ex.quality.factors.map((f) => (
                  <li key={f.key} className="flex items-center gap-2.5">
                    <Dot tone={FACTOR_TONE[f.tone]} />
                    <span className="text-[12.5px] text-ink-soft flex-1">{f.label}</span>
                    <span className="text-[11px] text-ink-muted">{f.note}</span>
                    <span className="text-[12px] tabular-nums font-bold text-ink w-12 text-right">{f.points}/{f.max}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-ink-muted mt-3">{ex.intent.note}</p>
          </Card>

          <Card>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2.5">
              Live recomputation <span className="text-ink-faint normal-case font-normal">(read-only — nothing is written)</span>
            </p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <Stat label="Fit now" value={String(live.fit)} tone={live.fit === l.fit ? "slate" : "amber"} sub={live.fit === l.fit ? "matches" : `stored ${l.fit}`} />
              <Stat label="Quality now" value={String(live.quality)} tone={live.quality === l.quality ? "slate" : "amber"} sub={live.quality === l.quality ? "matches" : `stored ${l.quality}`} />
              <Stat label="Grade now" value={live.grade} tone={live.drifted ? "amber" : "emerald"} sub={live.drifted ? `stored ${l.grade}` : "matches"} />
            </div>

            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">Fit breakdown, recomputed</p>
            <ul className="space-y-1 mb-3">
              {Object.entries(live.fitBreakdown).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between text-[12px]">
                  <span className="text-ink-soft font-mono">{k}</span>
                  <span className={`tabular-nums font-bold ${v > 0 ? "text-emerald-600" : "text-ink-faint"}`}>
                    {v > 0 ? `+${v}` : v}
                  </span>
                </li>
              ))}
            </ul>

            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">Quality breakdown, recomputed</p>
            <ul className="space-y-1">
              {Object.entries(live.qualityBreakdown).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between text-[12px]">
                  <span className="text-ink-soft font-mono">{k}</span>
                  <span className={`tabular-nums font-bold ${v > 0 ? "text-emerald-600" : v < 0 ? "text-red-600" : "text-ink-faint"}`}>
                    {v > 0 ? `+${v}` : v}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-3 pt-3 border-t border-hairline space-y-1 text-[11.5px]">
              <p className="text-ink-soft">
                Ladder used: <span className="font-bold text-ink">{live.preExecution ? "pre-execution" : "post-execution"}</span>
                <span className="text-ink-faint"> — {live.preExecution ? "no real call/WhatsApp yet, so fit + quality dominate" : "a rep has logged activity, so all three are weighted"}</span>
              </p>
              <p className="text-ink-soft">
                Inferred industry: <span className="font-mono text-ink">{live.inferredIndustry ?? "—"}</span>
                {" · "}state: <span className="font-mono text-ink">{live.inferredState ?? "—"}</span>
              </p>
              <p className="text-ink-soft">
                SQL check: fit {live.fit} ≥ {icp.sqlFitThreshold} AND intent {l.intent} ≥ {icp.sqlIntentThreshold} →{" "}
                <span className={live.isSql ? "text-emerald-600 font-bold" : "text-ink-muted font-bold"}>{live.isSql ? "SQL" : "not SQL"}</span>
                {live.isSql !== l.isSql && <span className="text-orange-600 font-bold"> · stored says {l.isSql ? "SQL" : "not SQL"}</span>}
              </p>
            </div>
          </Card>
        </div>

        {!icp.configured && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50/70 px-5 py-3 mt-3">
            <p className="text-[12.5px] font-bold text-orange-800">This account has not configured an ICP.</p>
            <p className="text-[11.5px] text-orange-700 mt-0.5">
              Fit short-circuits to a flat baseline of 38 for every lead, which keeps them around grade D regardless of
              who they are. Low grades here are an unset ICP, not a bad lead list.
            </p>
          </div>
        )}
      </section>

      {/* ── Confidence: unknown ≠ bad ── */}
      <section>
        <SectionLabel right={conf.needsEnrichment ? "below 50 — grade is provisional" : "enough data to trust the grade"}>
          Confidence · {conf.score}%
        </SectionLabel>
        <Card>
          <Bar pct={conf.score} tone={conf.score >= 75 ? "emerald" : conf.score >= 50 ? "sky" : conf.score >= 30 ? "amber" : "red"} height="h-2.5" />
          <p className="text-[12.5px] text-ink-soft mt-2.5">{conf.reason}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">What we know</p>
              <ul className="space-y-1">
                {conf.present.map((f) => (
                  <li key={f.key} className="flex items-center gap-2 text-[12px] text-ink-soft">
                    <Check className="w-3 h-3 text-emerald-500 shrink-0" strokeWidth={3} />{f.label}
                    <span className="text-ink-faint ml-auto tabular-nums">+{f.weight}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">What we don&rsquo;t know yet</p>
              {conf.missing.length === 0 ? (
                <p className="text-[12px] text-emerald-700 font-semibold">Nothing missing.</p>
              ) : (
                <ul className="space-y-1">
                  {conf.missing.map((f) => (
                    <li key={f.key} className="flex items-center gap-2 text-[12px] text-ink-muted">
                      <Minus className="w-3 h-3 text-slate-300 shrink-0" strokeWidth={3} />{f.label}
                      <span className="text-ink-faint ml-auto tabular-nums">−{f.weight}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <p className="text-[10.5px] text-ink-faint mt-3">
            Confidence is not the grade. The grade says how good the lead is; confidence says how much we actually
            know. A thin lead is an unknown lead, not a bad one.
          </p>
        </Card>
      </section>

      {/* ── Provenance ── */}
      <section>
        <SectionLabel>Provenance &amp; lifecycle</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <Stat label="Source" value={d.source.name} sub={`baseline ${d.source.intentBaseline} · reliability ${Math.round(d.source.reliability)}`} />
          <Stat label="Freshness" value={d.freshness.label} sub={d.freshness.note} />
          <Stat label="Stage" value={d.stage.name} sub={ago(d.stage.enteredAt)} />
          <Stat label="Assigned rep" value={d.rep?.name || "unassigned"} />
          <Stat label="Speed to lead" value={l.speedToLeadHours == null ? "—" : duration(l.speedToLeadHours * 3_600_000)} sub="import → first contact" />
          <Stat
            label="First-action rank"
            value={l.firstActionRank == null ? "—" : `#${l.firstActionRank}`}
            tone={l.firstActionRank != null && l.firstActionRank <= 10 ? "emerald" : "slate"}
            sub={l.firstActionRank == null ? "never contacted" : l.firstActionRank <= 10 ? "worked a recommendation" : "skipped the queue"}
          />
        </div>
        <div className="flex items-center gap-3 flex-wrap mt-3 text-[11.5px] text-ink-muted">
          <span>Imported {dateTime(l.importedAt)}</span>
          {l.sourceCollectedAt && <span>· data collected {dateTime(l.sourceCollectedAt)}</span>}
          {l.gradeChangedAt && <span>· grade last changed {ago(l.gradeChangedAt)}{l.previousGrade && ` (from ${l.previousGrade})`}</span>}
          {l.sqlCrossedAt && <span>· crossed SQL {ago(l.sqlCrossedAt)}</span>}
          {d.intakeSessionId && (
            <Link href={`/admin/intake/${d.intakeSessionId}`} className="text-sky-600 font-semibold hover:text-sky-700">
              · view the intake session that brought this lead in →
            </Link>
          )}
        </div>
        {l.inquiryText && (
          <Card className="mt-3">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1">Inquiry text</p>
            <p className="text-[12.5px] text-ink-soft whitespace-pre-wrap">{l.inquiryText}</p>
          </Card>
        )}
      </section>

      {/* ── Recommendation history ── */}
      <section>
        <SectionLabel right={<Link href="/admin/recommendations" className="text-sky-600 font-semibold hover:text-sky-700">platform RAR →</Link>}>
          Recommendation history · {d.recommendationEvents.length}
        </SectionLabel>
        {d.recommendationEvents.length === 0 ? (
          <Card><p className="text-[13px] text-ink-muted">No recommendation has been shown for this lead yet.</p></Card>
        ) : (
          <TableWrap>
            <table className="w-full text-left min-w-[720px]">
              <THead>
                <Th>Event</Th>
                <Th>Action shown</Th>
                <Th>Grade then</Th>
                <Th>Confidence then</Th>
                <Th>Skip reason</Th>
                <Th>By</Th>
                <Th>When</Th>
              </THead>
              <TBody>
                {d.recommendationEvents.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      <Pill tone={r.event === "ACCEPTED" || r.event === "EXECUTED" ? "emerald" : r.event === "IGNORED" || r.event === "DISMISSED" ? "amber" : r.event === "OUTCOME" ? "violet" : "sky"}>
                        {r.event}
                      </Pill>
                    </Td>
                    <Td>{r.actionLabel ?? <span className="text-ink-faint">—</span>}</Td>
                    <Td className="font-mono">{r.gradeAtEvent ?? "—"}</Td>
                    <Td>{r.confidenceBand?.replace("_", " ") ?? <span className="text-ink-faint">—</span>}</Td>
                    <Td>{r.skipReason ? <span className="text-orange-600 font-semibold">{r.skipReason.replace(/_/g, " ").toLowerCase()}</span> : <span className="text-ink-faint">—</span>}</Td>
                    <Td>{r.actor ?? <span className="text-ink-faint">system</span>}</Td>
                    <Td className="text-ink-muted whitespace-nowrap">{dateTime(r.at)}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableWrap>
        )}
      </section>

      {/* ── Signals ── */}
      <section>
        <SectionLabel right={<Link href={`/admin/signals?lead=${l.id}`} className="text-sky-600 font-semibold hover:text-sky-700">signal explorer →</Link>}>
          Signals · {d.signals.length}
        </SectionLabel>
        {d.signals.length === 0 ? (
          <Card><p className="text-[13px] text-ink-muted">No signals — not even a source baseline. That is unusual for an imported lead.</p></Card>
        ) : (
          <TableWrap>
            <table className="w-full text-left min-w-[720px]">
              <THead>
                <Th>Signal</Th>
                <Th className="text-right">Value</Th>
                <Th className="text-right">Intent before</Th>
                <Th className="text-right">Intent after</Th>
                <Th className="text-right">Applied</Th>
                <Th>Grade then</Th>
                <Th>By</Th>
                <Th>When</Th>
              </THead>
              <TBody>
                {d.signals.map((s) => {
                  const applied = s.after - s.before
                  const clamped = applied !== s.value
                  return (
                    <Tr key={s.id}>
                      <Td className="font-mono text-[11.5px]">{s.type}</Td>
                      <Td className={`text-right tabular-nums font-bold ${s.value > 0 ? "text-emerald-600" : s.value < 0 ? "text-red-600" : "text-ink-muted"}`}>
                        {s.value > 0 ? `+${s.value}` : s.value}
                      </Td>
                      <Td className="text-right tabular-nums">{s.before}</Td>
                      <Td className="text-right tabular-nums font-semibold text-ink">{s.after}</Td>
                      <Td className="text-right tabular-nums">
                        {applied > 0 ? `+${applied}` : applied}
                        {clamped && <span className="text-orange-500 ml-1" title="Clamped by the [source baseline, 100] bound">*</span>}
                      </Td>
                      <Td><Grade grade={s.gradeAt} /></Td>
                      <Td>{s.actor ?? <span className="text-ink-faint">system</span>}</Td>
                      <Td className="text-ink-muted whitespace-nowrap">{dateTime(s.at)}</Td>
                    </Tr>
                  )
                })}
              </TBody>
            </table>
          </TableWrap>
        )}
        {d.signals.some((s) => s.after - s.before !== s.value) && (
          <p className="text-[10.5px] text-ink-faint mt-1.5">
            <span className="text-orange-500">*</span> Applied differs from the signal&rsquo;s value: intent is clamped
            to [source baseline, 100], so part of the signal was absorbed. Expected, not a bug.
          </p>
        )}
      </section>

      {/* ── Full evidence timeline ── */}
      <section>
        <SectionLabel right={`${d.evidence.length} ${d.evidence.length === 1 ? "entry" : "entries"} · newest first`}>
          Evidence timeline
        </SectionLabel>
        <Card>
          {d.evidence.length === 0 ? <EmptyState>Nothing recorded.</EmptyState> : (
            <ol className="relative border-l border-hairline-strong ml-1.5 space-y-3">
              {d.evidence.map((e, i) => (
                <li key={i} className="ml-4">
                  <span className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ${
                    KIND_TONE[e.kind] === "emerald" ? "bg-emerald-500"
                    : KIND_TONE[e.kind] === "sky" ? "bg-sky-500"
                    : KIND_TONE[e.kind] === "violet" ? "bg-violet-500"
                    : KIND_TONE[e.kind] === "amber" ? "bg-orange-400" : "bg-slate-400"
                  }`} />
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12.5px] text-ink">
                        <span className="text-[9.5px] font-black uppercase tracking-wider text-ink-muted mr-2">{e.kind}</span>
                        <span className="font-semibold">{e.title}</span>
                        {e.detail && <span className="text-ink-soft"> — {e.detail}</span>}
                      </p>
                      {e.meta && <p className="text-[10.5px] text-ink-faint font-mono mt-0.5">{e.meta}</p>}
                    </div>
                    <span className="text-[10.5px] text-ink-muted shrink-0 tabular-nums whitespace-nowrap">
                      {e.actor && <span className="mr-2">{e.actor}</span>}{dateTime(e.at)}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </section>

      {/* ── The ICP this was judged against ── */}
      <section>
        <SectionLabel right={icp.configured ? "account-level, shared by every workspace" : "not configured"}>
          ICP used for fit
        </SectionLabel>
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-[12.5px]">
            {[
              ["Industries", icp.industries],
              ["States", icp.states],
              ["Business types", icp.businessTypes],
              ["Roles", icp.roles],
            ].map(([label, vals]) => (
              <div key={label as string} className="flex gap-3">
                <span className="text-ink-muted w-28 shrink-0">{label as string}</span>
                <span className="text-ink-soft">
                  {(vals as string[]).length ? (vals as string[]).join(", ") : <span className="text-ink-faint">none set</span>}
                </span>
              </div>
            ))}
            <div className="flex gap-3">
              <span className="text-ink-muted w-28 shrink-0">Budget</span>
              <span className="text-ink-soft">
                {icp.budgetMin != null || icp.budgetMax != null
                  ? `${inr(icp.budgetMin ?? 0)} – ${icp.budgetMax == null ? "∞" : inr(icp.budgetMax)}`
                  : <span className="text-ink-faint">none set</span>}
              </span>
            </div>
            <div className="flex gap-3">
              <span className="text-ink-muted w-28 shrink-0">Sales cycle</span>
              <span className="text-ink-soft">{icp.salesCycle.replace(/_/g, " ").toLowerCase()}</span>
            </div>
            <div className="flex gap-3">
              <span className="text-ink-muted w-28 shrink-0">SQL thresholds</span>
              <span className="text-ink-soft">fit ≥ {icp.sqlFitThreshold} · intent ≥ {icp.sqlIntentThreshold}</span>
            </div>
            <div className="flex gap-3">
              <span className="text-ink-muted w-28 shrink-0">This lead&rsquo;s value</span>
              <span className="text-ink-soft">{l.expectedValue == null ? <span className="text-ink-faint">not set</span> : inr(l.expectedValue)}</span>
            </div>
          </div>
        </Card>
      </section>

      {/* ── Raw ── */}
      <section>
        <SectionLabel>Raw stored breakdowns</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">fit_score_breakdown</p>
            <pre className="text-[11px] text-ink-soft font-mono overflow-x-auto">{JSON.stringify(d.rawBreakdowns.fit, null, 2) ?? "null"}</pre>
          </Card>
          <Card>
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">quality_score_breakdown</p>
            <pre className="text-[11px] text-ink-soft font-mono overflow-x-auto">{JSON.stringify(d.rawBreakdowns.quality, null, 2) ?? "null"}</pre>
          </Card>
        </div>
        <p className="text-[10.5px] text-ink-faint mt-2">
          Lead id <span className="font-mono">{l.id}</span>
          {d.importJobId && <> · import job <span className="font-mono">{d.importJobId}</span></>}
          {" · junk flags "}<span className="font-mono">{l.junkFlags.length ? l.junkFlags.join(", ") : "none"}</span>
          {" · WhatsApp stage "}<span className="font-mono">{l.waStage}</span>
          {" · intent baseline "}<span className="font-mono">{num(l.intentBaseline)}</span>
        </p>
      </section>
    </div>
  )
}
