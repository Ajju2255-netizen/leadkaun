import { notFound } from "next/navigation"
import Link from "next/link"
import { Check, Circle, AlertTriangle } from "lucide-react"
import {
  getIntakeSessionDetail, STATE_LABELS, ABANDON_LABELS, STATE_ORDER, isTerminal,
} from "@/lib/admin/intake"
import type { EvidenceFinding } from "@/lib/intake/types"
import {
  Card, Stat, SectionLabel, Bar, Pill, EmptyState, Dot,
  num, dateTime, clockIst, duration, type Tone, BackLink,
} from "../../_components/ui"
import { IntakeState } from "@prisma/client"

export const metadata = { title: "Intake session" }

export const dynamic = "force-dynamic"

const STATE_TONE: Record<IntakeState, Tone> = {
  CREATED: "slate", ANALYSING: "sky", REPORT_READY: "sky", VIEWED: "sky",
  APPROVED: "emerald", IMPORTING: "sky", COMPLETED: "emerald",
  ABANDONED: "amber", CANCELLED: "amber", FAILED: "red",
}

/** An engine claim, rendered honestly: unknown is grey, never red. */
function Finding({ label, f }: { label: string; f: EvidenceFinding | undefined }) {
  if (!f) return null
  return (
    <div className="py-2.5 border-b border-hairline last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">{label}</p>
          <p className={`text-[13px] mt-0.5 ${f.known ? "text-ink font-semibold" : "text-ink-muted"}`}>{f.claim}</p>
        </div>
        <span className="shrink-0 flex items-center gap-2">
          {f.known ? <Pill tone="emerald">known</Pill> : <Pill tone="slate">not determined</Pill>}
          <span className="text-[11px] tabular-nums text-ink-muted w-9 text-right">{f.confidence}%</span>
        </span>
      </div>
      {f.evidence?.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {f.evidence.map((e, i) => (
            <li key={i} className="text-[11px] text-ink-soft flex items-start gap-1.5">
              <span className="text-ink-faint mt-[3px]">·</span>{e}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default async function IntakeSessionPage({ params }: { params: { sessionId: string } }) {
  const s = await getIntakeSessionDetail(params.sessionId)
  if (!s) notFound()
  const r = s.report
  const clock = s.clock

  // The machine's progress track — terminal failure states are shown separately.
  const reachedIndex = STATE_ORDER.indexOf(s.state)
  const eventStates = new Set(s.events.map((e) => e.state))
  const firstAt = new Map<IntakeState, Date>()
  for (const e of s.events) if (!firstAt.has(e.state)) firstAt.set(e.state, e.at)

  return (
    <div className="space-y-8">
      <BackLink href="/intake">Intake sessions</BackLink>

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink font-mono">{s.id}</h1>
          <div className="flex items-center gap-2 flex-wrap text-[12px] text-ink-soft mt-1.5">
            {s.account && (
              <Link href={`/accounts/${s.account.id}`}><Pill tone="sky">{s.account.name}</Pill></Link>
            )}
            {s.workspaceName && <Pill tone="slate">{s.workspaceName}</Pill>}
            {s.user && <span>· {s.user.name} ({s.user.email})</span>}
            <span>· {s.source.replace(/_/g, " ").toLowerCase()}</span>
          </div>
        </div>
        <div className="text-right">
          <Pill tone={STATE_TONE[s.state]}>{STATE_LABELS[s.state]}</Pill>
          {s.abandonReason && (
            <p className="text-[11.5px] text-orange-600 font-semibold mt-1.5">
              Reason given: {ABANDON_LABELS[s.abandonReason]}
            </p>
          )}
        </div>
      </div>

      {/* ── State machine ── */}
      <section>
        <SectionLabel right="immutable, append-only — insert never update">State machine</SectionLabel>
        <Card>
          <ol className="space-y-0">
            {STATE_ORDER.map((st, i) => {
              const reached = eventStates.has(st) || (reachedIndex >= 0 && i <= reachedIndex)
              const at = firstAt.get(st)
              return (
                <li key={st} className="flex items-start gap-3 py-1.5">
                  <div className="flex flex-col items-center shrink-0">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center ${reached ? "bg-sky-500" : "bg-slate-200"}`}>
                      {reached
                        ? <Check className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />
                        : <Circle className="w-1.5 h-1.5 text-slate-400" strokeWidth={4} />}
                    </span>
                    {i < STATE_ORDER.length - 1 && <span className={`w-px h-4 ${reached ? "bg-sky-200" : "bg-slate-200"}`} />}
                  </div>
                  <div className="flex-1 flex items-baseline justify-between gap-3 -mt-0.5">
                    <span className={`text-[13px] font-semibold ${reached ? "text-ink" : "text-ink-faint"}`}>
                      {STATE_LABELS[st]}
                    </span>
                    <span className="text-[11.5px] tabular-nums text-ink-muted shrink-0">
                      {at ? <>{clockIst(at)} <span className="text-ink-faint">IST</span></> : "—"}
                    </span>
                  </div>
                </li>
              )
            })}
          </ol>

          {isTerminal(s.state) && !STATE_ORDER.includes(s.state) && (
            <div className={`mt-3 rounded-xl px-4 py-2.5 ${s.state === "FAILED" ? "bg-red-50 border border-red-200" : "bg-orange-50 border border-orange-200"}`}>
              <p className={`text-[12.5px] font-bold ${s.state === "FAILED" ? "text-red-700" : "text-orange-700"}`}>
                Ended in {STATE_LABELS[s.state]}
                {s.abandonReason && ` — ${ABANDON_LABELS[s.abandonReason]}`}
              </p>
            </div>
          )}
        </Card>
      </section>

      {/* ── Time to Trust ── */}
      <section>
        <SectionLabel right="how long it took this customer to believe us">Time to Trust</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat label="Upload → analysis" value={duration(clock.uploadToAnalysisMs)} tone="sky" />
          <Stat label="Analysis → report read" value={duration(clock.analysisToViewMs)} tone="sky" />
          <Stat label="Report read → approved" value={duration(clock.viewToApprovalMs)} tone="sky" sub="the decision" />
          <Stat label="Total TTT" value={duration(clock.totalTttMs)} tone="emerald" sub="upload → approved" />
          <Stat label="Import duration" value={duration(clock.approvalToImportDoneMs)} sub="approved → done" />
        </div>
        <div className="mt-3 rounded-2xl border border-slate-200/70 bg-white px-5 py-4">
          <table className="w-full text-[12px]">
            <tbody className="divide-y divide-hairline">
              {[
                ["Upload started", clock.uploadStartedAt],
                ["Analysis finished", clock.analysisFinishedAt],
                ["Report viewed", clock.reportViewedAt],
                ["Approved", clock.approvedAt],
                ["Import started", clock.importStartedAt],
                ["Import completed", clock.importCompletedAt],
              ].map(([label, at]) => (
                <tr key={label as string}>
                  <td className="py-1.5 text-ink-soft">{label as string}</td>
                  <td className="py-1.5 text-right tabular-nums text-ink font-medium">{dateTime(at as Date | null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10.5px] text-ink-faint mt-2">
            Engine analysis itself took {duration(clock.analysisDurationMs)}. Anything long between
            &ldquo;analysis finished&rdquo; and &ldquo;report viewed&rdquo; is the customer hesitating, not the product being slow.
          </p>
        </div>
      </section>

      {/* ── Dataset + internal scores ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <SectionLabel right="structural metadata only — no customer rows are stored">Dataset</SectionLabel>
          <Card>
            <table className="w-full text-[12.5px]">
              <tbody className="divide-y divide-hairline">
                {[
                  ["Rows", num(s.dataset.rows)],
                  ["Columns", String(s.dataset.columns)],
                  ["Column signature", s.dataset.sampleHash ?? "—"],
                  ["Detected country", s.dataset.country ?? "not determined"],
                  ["Detected currency", s.dataset.currency ?? "not determined"],
                  ["Detected business type", s.dataset.businessType ?? "not determined"],
                  ["Mapping version", s.dataset.mappingVersion],
                  ["Analysis version", s.dataset.analysisVersion],
                  ["Engine version", s.dataset.engineVersion],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td className="py-1.5 text-ink-soft">{k}</td>
                    <td className="py-1.5 text-right font-mono text-ink">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {s.siblingCount > 0 && (
              <p className="text-[11.5px] text-sky-700 mt-2.5">
                This account has uploaded {s.siblingCount} other dataset{s.siblingCount === 1 ? "" : "s"} with the
                same column signature — a recurring export, so a saved mapping would apply.
              </p>
            )}
          </Card>
        </section>

        <section>
          <SectionLabel right="internal — the customer never sees these numbers">Confidence decomposition</SectionLabel>
          <Card>
            {s.scores.importIntelligenceScore == null ? (
              <p className="text-[13px] text-ink-muted">No scores recorded on this session.</p>
            ) : (
              <>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[12px] font-semibold text-ink-soft">Import Intelligence Score</span>
                  <span className="text-[20px] font-semibold tabular-nums text-ink">{s.scores.importIntelligenceScore}</span>
                </div>
                <Bar
                  pct={s.scores.importIntelligenceScore}
                  tone={s.scores.importIntelligenceScore >= 75 ? "emerald" : s.scores.importIntelligenceScore >= 60 ? "sky" : "amber"}
                  height="h-2.5"
                />
                <div className="space-y-2 mt-3">
                  {[
                    ["Mapping confidence", s.scores.mappingConfidence, "how many columns we recognised"],
                    ["Data completeness", s.scores.completeness, "how filled the core fields are"],
                    ["Contact quality", s.scores.contactQuality, "how reachable the leads are"],
                    ["Business context", s.scores.businessContext, "how much company/industry/role signal exists"],
                  ].map(([label, v, note]) => (
                    <div key={label as string}>
                      <div className="flex items-baseline justify-between text-[11.5px] mb-0.5">
                        <span className="text-ink-soft">{label as string}</span>
                        <span className="tabular-nums text-ink font-semibold">{v == null ? "—" : v}</span>
                      </div>
                      <Bar pct={(v as number) ?? 0} tone={v == null ? "slate" : "sky"} />
                      <p className="text-[10px] text-ink-faint mt-0.5">{note as string}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10.5px] text-ink-faint mt-3 leading-snug">
                  Decomposed on purpose: four components tell you <em>why</em> an import went badly; one opaque number
                  never does.
                </p>
              </>
            )}
          </Card>
        </section>
      </div>

      {/* ── The frozen report ── */}
      <section>
        <SectionLabel right="frozen at analysis time — exactly what the customer read">
          Import Intelligence Report
        </SectionLabel>
        {!r ? (
          <Card><EmptyState>No report snapshot stored on this session.</EmptyState></Card>
        ) : (
          <div className="space-y-4">
            <Card>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">Readiness shown</p>
                  <p className="text-[18px] font-semibold text-ink mt-0.5">{r.readiness?.label ?? "—"}</p>
                  <p className="text-[12.5px] text-ink-soft mt-0.5 max-w-xl">{r.readiness?.message}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">Band</p>
                  <Pill tone={r.confidence?.band === "ready" ? "emerald" : r.confidence?.band === "review" ? "amber" : "red"}>
                    {r.confidence?.band ?? "—"}
                  </Pill>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <Stat label="Total leads" value={num(r.totalLeads)} />
                <Stat label="Sampled" value={num(r.sampled)} sub="rows profiled" />
                <Stat
                  label="Duplicate estimate"
                  value={r.duplicateEstimate ? `${r.duplicateEstimate.pct}%` : "—"}
                  tone={r.duplicateEstimate && r.duplicateEstimate.pct > 20 ? "amber" : "slate"}
                  sub={r.duplicateEstimate ? `${num(r.duplicateEstimate.estimatedRows)} rows` : undefined}
                />
                <Stat
                  label="Contact quality"
                  value={r.contactQuality ? `${r.contactQuality.validPhonePct}% phone` : "—"}
                  sub={r.contactQuality ? `${r.contactQuality.validEmailPct}% email · primary ${r.contactQuality.primary}` : undefined}
                />
              </div>
              {r.recommendation && (
                <p className="text-[13px] text-ink mt-4 font-semibold">{r.recommendation}</p>
              )}
              {r.closingLine && (
                <p className="text-[12.5px] text-sky-700 italic mt-1">{r.closingLine}</p>
              )}
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">Findings &amp; evidence</p>
                <Finding label="Lead type" f={r.leadType} />
                <Finding label="Country" f={r.country} />
                <Finding label="Currency" f={r.currency} />
                <Finding label="Business type" f={r.businessType} />
                <p className="text-[10.5px] text-ink-faint mt-2.5 leading-snug">
                  Law 45 / Law 1: a claim is either asserted <em>with</em> evidence, or stated plainly as
                  &ldquo;not determined&rdquo;. Unknown is never dressed up as a finding.
                </p>
              </Card>

              <div className="space-y-4">
                <Card>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">Data readiness by area</p>
                  {(r.dataReadiness ?? []).length === 0 ? (
                    <p className="text-[12.5px] text-ink-muted">None recorded.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {r.dataReadiness.map((d) => (
                        <li key={d.area} className="flex items-start gap-2.5">
                          <Dot tone={d.rating === "Excellent" ? "emerald" : d.rating === "Good" ? "sky" : "amber"} />
                          <div className="min-w-0">
                            <p className="text-[12.5px] text-ink font-semibold">{d.area} — <span className="font-normal text-ink-soft">{d.rating}</span></p>
                            <p className="text-[11px] text-ink-muted">{d.note}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">Missing fields</p>
                  {(r.missingFields ?? []).length === 0 ? (
                    <p className="text-[12.5px] text-emerald-700 font-semibold">Nothing flagged as missing.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {r.missingFields.map((f) => <Pill key={f} tone="amber">{f}</Pill>)}
                    </div>
                  )}
                </Card>
              </div>
            </div>

            {((r.noticed ?? []).length > 0 || (r.whatHappensNext ?? []).length > 0 || (r.howWeDetermined ?? []).length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {[
                  ["Things we noticed", r.noticed],
                  ["What happens next", r.whatHappensNext],
                  ["How we determined this", r.howWeDetermined],
                ].map(([title, items]) => (
                  <Card key={title as string}>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">{title as string}</p>
                    {((items as string[]) ?? []).length === 0 ? (
                      <p className="text-[12px] text-ink-muted">—</p>
                    ) : (
                      <ul className="space-y-1">
                        {(items as string[]).map((t, i) => (
                          <li key={i} className="text-[12px] text-ink-soft flex items-start gap-1.5">
                            <span className="text-ink-faint mt-[3px]">·</span>{t}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Resulting import ── */}
      <section>
        <SectionLabel>Resulting import</SectionLabel>
        {!s.importJob ? (
          <Card>
            <p className="text-[13px] text-ink-muted">
              {s.state === "COMPLETED" || s.state === "IMPORTING"
                ? "The session reports an import but no linked job row was found."
                : "No import job — this session never reached approval."}
            </p>
          </Card>
        ) : (
          <Card>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Stat label="Status" value={s.importJob.status} tone={s.importJob.status === "COMPLETE" ? "emerald" : s.importJob.status === "FAILED" ? "red" : "sky"} />
              <Stat label="Rows" value={num(s.importJob.totalRows)} />
              <Stat label="Inserted" value={num(s.importJob.inserted)} tone="emerald" />
              <Stat label="Duplicates" value={num(s.importJob.duplicates)} tone={s.importJob.duplicates > 0 ? "amber" : "slate"} />
              <Stat label="Skipped rows" value={num(s.importJob.errors)} tone={s.importJob.errors > 0 ? "amber" : "slate"} />
            </div>
            <p className="text-[11px] text-ink-muted mt-2.5">
              {s.importJob.fileName && <>File <span className="font-mono">{s.importJob.fileName}</span> · </>}
              job <span className="font-mono">{s.importJob.id}</span>
              {s.importJob.completedAt && <> · completed {dateTime(s.importJob.completedAt)}</>}
            </p>
            {r && s.importJob.duplicates > 0 && r.duplicateEstimate && (
              <p className="text-[11.5px] text-ink-soft mt-2 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
                The engine estimated {r.duplicateEstimate.pct}% duplicates from the sample; the import found{" "}
                {num(s.importJob.duplicates)} of {num(s.importJob.totalRows)} rows
                ({Math.round((s.importJob.duplicates / Math.max(1, s.importJob.totalRows)) * 100)}%). A large gap means
                the sample wasn&rsquo;t representative.
              </p>
            )}
          </Card>
        )}
      </section>

      {/* ── Raw event log ── */}
      <section>
        <SectionLabel right={`${s.events.length} entries`}>Raw event log</SectionLabel>
        <Card>
          {s.events.length === 0 ? <EmptyState>No events.</EmptyState> : (
            <table className="w-full text-left text-[12px]">
              <tbody className="divide-y divide-hairline">
                {s.events.map((e) => (
                  <tr key={e.id}>
                    <td className="py-1.5"><Pill tone={STATE_TONE[e.state]}>{e.state}</Pill></td>
                    <td className="py-1.5 text-ink-soft">{e.note ?? ""}</td>
                    <td className="py-1.5 text-right tabular-nums text-ink-muted whitespace-nowrap">{dateTime(e.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>
    </div>
  )
}
