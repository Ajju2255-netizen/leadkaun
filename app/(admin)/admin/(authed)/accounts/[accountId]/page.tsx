import { notFound } from "next/navigation"
import { DeleteRecord } from "../../_components/DeleteRecord"
import Link from "next/link"
import { Check, Minus } from "lucide-react"
import { getCompany360 } from "@/lib/admin/metrics"
import { getCompanyTimeline } from "@/lib/admin/timeline"
import { computeAccountHealth } from "@/lib/admin/health"
import { getAccountActivation, getAccountLimits, getAccountIntelligence, getAccountTeam } from "@/lib/admin/accounts"
import { getRecommendationIntelligence } from "@/lib/admin/recommendations"
import { listIntakeSessions, STATE_LABELS } from "@/lib/admin/intake"
import { getAccountFlags, FEATURE_KEYS, FEATURE_LABELS } from "@/lib/feature-flags"
import { getAccountSubscription, listPlans } from "@/lib/admin/billing"
import { getAccountRevenueHistory } from "@/lib/admin/revenue-history"
import { getPlatformSession } from "@/lib/auth/platform"
import { Timeline } from "../../_components/Timeline"
import { LoginAsButton } from "./LoginAsButton"
import { DeleteAccountButton } from "./DeleteAccountButton"
import { FlagToggles } from "./FlagToggles"
import { PlanEditor } from "./PlanEditor"
import {
  Card, Stat, SectionLabel, Bar, BarRow, Grade, Pill, Dot, EmptyState,
  TableWrap, THead, TBody, Th, Td, Tr,
  num, inr, ago, dateOnly, dateTime, pctOrDash, healthTone, riskTone, BackLink,
} from "../../_components/ui"

export const metadata = { title: "Account" }

export const dynamic = "force-dynamic"

export default async function Account360({ params }: { params: { accountId: string } }) {
  const id = params.accountId
  const [c, timeline, health, flags, sub, plans, activation, limits, intel, team, reco, intakeSessions, session, revenue] =
    await Promise.all([
      getCompany360(id),
      getCompanyTimeline(id, 40),
      computeAccountHealth(id),
      getAccountFlags(id),
      getAccountSubscription(id),
      listPlans(),
      getAccountActivation(id),
      getAccountLimits(id),
      getAccountIntelligence(id),
      getAccountTeam(id),
      getRecommendationIntelligence(30, id),
      listIntakeSessions({ accountId: id, take: 8 }),
      getPlatformSession(),
      getAccountRevenueHistory(id),
    ])
  if (!c) notFound()

  const canWrite = session?.role === "SUPER_ADMIN"
  const flagItems = FEATURE_KEYS.map((k) => ({ key: k, label: FEATURE_LABELS[k], enabled: flags[k] }))
  const planOptions = plans.map((p) => ({ key: p.key, name: p.name, priceRupees: Math.round(p.price_inr / 100) }))
  const currentSub = sub ? { planKey: sub.planKey, status: sub.status, mrrRupees: Math.round(sub.mrrInr / 100) } : null
  const done = activation.filter((s) => s.done).length

  return (
    <div className="space-y-8">
      <BackLink href="/accounts">Accounts</BackLink>

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">{c.account.name}</h1>
          <div className="flex items-center gap-2 flex-wrap text-[12px] text-ink-soft mt-1.5">
            <span>{c.account.industry}</span>
            {(c.account.city || c.account.state) && <span>· {[c.account.city, c.account.state].filter(Boolean).join(", ")}</span>}
            <span>· {c.account.teamSize.toLowerCase().replace(/_/g, " ")}</span>
            <span>· joined {dateOnly(c.account.createdAt)}</span>
            <span>· active {ago(c.lastActiveAt)}</span>
            {!c.account.icpConfigured && <Pill tone="amber">ICP not set</Pill>}
          </div>
        </div>
        {canWrite
          ? <LoginAsButton accountId={c.account.id} />
          : <Pill tone="slate">read-only role — impersonation disabled</Pill>}
      </div>

      {/* ── Top facts ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Plan" value={limits.planName} sub={limits.subStatus ?? "no subscription"} />
        <Stat label="MRR" value={sub && sub.mrrInr > 0 ? inr(Math.round(sub.mrrInr / 100)) : "—"} tone="emerald" />
        <Stat label="Owner" value={c.owner?.name || "—"} sub={c.owner?.email} />
        <Stat label="Health" value={`${health.score} / 100`} tone={healthTone(health.band)} sub={`${health.churnRisk} churn risk`} />
        <Stat label="Activation" value={`${done} / ${activation.length}`} tone={done === activation.length ? "emerald" : "amber"} sub="checklist steps" />
      </div>

      {/* ── Activation checklist ── */}
      <section>
        <SectionLabel right="each step is a real row, with its timestamp">Activation</SectionLabel>
        <Card>
          <ol className="space-y-2">
            {activation.map((s) => (
              <li key={s.label} className="flex items-start gap-3">
                <span className={`mt-[3px] w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${s.done ? "bg-emerald-500" : "bg-slate-200"}`}>
                  {s.done ? <Check className="w-2.5 h-2.5 text-white" strokeWidth={3.5} /> : <Minus className="w-2.5 h-2.5 text-slate-400" strokeWidth={3.5} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={`text-[13px] font-semibold ${s.done ? "text-ink" : "text-ink-muted"}`}>{s.label}</span>
                    <span className="text-[11px] text-ink-muted tabular-nums shrink-0">{s.at ? dateTime(s.at) : "—"}</span>
                  </div>
                  <p className="text-[10.5px] text-ink-faint leading-snug">{s.hint}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      {/* ── Usage + limits ── */}
      <section>
        <SectionLabel right={`${limits.planName} caps`}>Usage against plan limits</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[12px] font-semibold text-ink-soft">Seats</span>
              <span className="text-[12px] tabular-nums text-ink">
                {limits.seats.used} / {limits.seats.limit}
                {limits.seats.isFull && <span className="text-red-600 font-bold ml-2">full</span>}
              </span>
            </div>
            <Bar pct={limits.seats.pct} tone={limits.seats.isFull ? "red" : limits.seats.pct >= 80 ? "amber" : "emerald"} />
            <p className="text-[10.5px] text-ink-faint mt-1.5">
              A seat is any user that is active <em>or</em> has a pending invite. Invites 409 at the cap.
            </p>
          </Card>
          <Card>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[12px] font-semibold text-ink-soft">Active leads</span>
              <span className="text-[12px] tabular-nums text-ink">
                {num(limits.leads.used)} / {limits.leads.limit == null ? "unlimited" : num(limits.leads.limit)}
                {limits.leads.isOver && <span className="text-red-600 font-bold ml-2">at cap</span>}
              </span>
            </div>
            <Bar pct={limits.leads.pct} tone={limits.leads.isOver ? "red" : limits.leads.nearLimit ? "amber" : "emerald"} />
            <p className="text-[10.5px] text-ink-faint mt-1.5">
              Open leads only — won/lost/junk free a slot. At the cap only NEW leads are blocked; existing ones stay usable.
            </p>
          </Card>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
          <Stat label="Leads" value={num(c.usage.leads)} />
          <Stat label="Activities" value={num(c.usage.activities)} />
          <Stat label="Recs used" value={num(c.usage.recommendationsUsed)} />
          <Stat label="Follow-ups" value={num(c.usage.followUps)} />
          <Stat label="Won" value={num(c.usage.won)} tone="emerald" />
          <Stat label="Won value" value={inr(c.usage.wonValueInr)} tone="emerald" />
        </div>
      </section>

      {/* ── Intelligence ── */}
      <section>
        <SectionLabel right={<Link href={`/leads?account=${id}`} className="text-sky-600 font-semibold hover:text-sky-700">inspect leads →</Link>}>
          Intelligence
        </SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2.5">Grade distribution</p>
            {intel.gradeDistribution.every((g) => g.count === 0) ? (
              <p className="text-[13px] text-ink-muted">No leads yet.</p>
            ) : (
              <div className="space-y-1.5">
                {intel.gradeDistribution.map((g) => (
                  <div key={g.grade} className="flex items-center gap-2.5">
                    <Grade grade={g.grade} />
                    <div className="flex-1"><Bar pct={g.pct} tone={g.grade === "A" ? "emerald" : g.grade === "B" ? "sky" : g.grade === "F" ? "slate" : "amber"} /></div>
                    <span className="text-[11.5px] tabular-nums text-ink-soft w-24 text-right">{num(g.count)} · {g.pct}%</span>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 mt-3">
              <Stat label="Avg fit" value={intel.avgFit == null ? "—" : String(intel.avgFit)} />
              <Stat label="Avg intent" value={intel.avgIntent == null ? "—" : String(intel.avgIntent)} />
              <Stat label="Avg quality" value={intel.avgQuality == null ? "—" : String(intel.avgQuality)} />
            </div>
          </Card>

          <Card>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2.5">Recommendations · 30 days</p>
            {reco.isEmpty ? (
              <p className="text-[13px] text-ink-muted">No recommendation events in this window.</p>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] text-ink-soft">RAR</span>
                  <span className="text-[18px] font-semibold tabular-nums text-sky-600">{pctOrDash(reco.rates.rar)}</span>
                </div>
                <Bar pct={reco.rates.rar ?? 0} tone="sky" />
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Shown" value={num(reco.counts.shown)} />
                  <Stat label="Accepted" value={num(reco.counts.accepted)} tone="emerald" />
                  <Stat label="Ignored" value={num(reco.counts.ignored)} tone="amber" />
                </div>
                {reco.skipReasons.filter((s) => s.count > 0).length > 0 && (
                  <div className="pt-1 space-y-1.5">
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-faint">Why they skipped</p>
                    {reco.skipReasons.filter((s) => s.count > 0).map((s) => (
                      <BarRow key={s.reason} label={s.label} count={s.count} pct={s.pct} tone="amber" />
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-3">
          <Stat label="SQL leads" value={num(intel.sqlCount)} tone="emerald" />
          <Stat label="Missed" value={num(intel.missedCount)} tone={intel.missedCount > 0 ? "amber" : "slate"} />
          <Stat label="₹ at risk" value={inr(intel.atRiskValueInr)} tone={intel.atRiskValueInr > 0 ? "red" : "slate"} />
          <Stat label="Junk" value={num(intel.junkCount)} />
          <Stat label="Duplicates" value={num(intel.duplicateCount)} />
          <Stat label="Score events" value={num(intel.scoreEvents)} />
          <Stat label="Intakes" value={`${intel.intakeApproved} / ${intel.intakeSessions}`} sub="approved / total" />
        </div>
      </section>

      {/* ── Team ── */}
      <section>
        <SectionLabel right={<Link href={`/users?account=${id}`} className="text-sky-600 font-semibold hover:text-sky-700">all users →</Link>}>
          Team · {team.length}
        </SectionLabel>
        <TableWrap>
          <table className="w-full text-left min-w-[760px]">
            <THead>
              <Th>Member</Th>
              <Th>Role</Th>
              <Th className="text-right">Assigned</Th>
              <Th className="text-right">Contacted</Th>
              <Th className="text-right">Recs adopted</Th>
              <Th className="text-right">Won</Th>
              <Th className="text-right">Signals 30d</Th>
              <Th>Last active</Th>
              <Th className="text-right">Remove</Th>
            </THead>
            <TBody>
              {team.length === 0 ? (
                <tr><td colSpan={9}><EmptyState>No users.</EmptyState></td></tr>
              ) : team.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <p className="text-[13px] font-semibold text-ink">{u.name}</p>
                    <p className="text-[11px] text-ink-muted">{u.email}</p>
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5">
                      <Pill tone={u.role === "ADMIN" ? "sky" : u.role === "MANAGER" ? "violet" : "slate"}>{u.role}</Pill>
                      {!u.isActive && <Pill tone="amber">inactive</Pill>}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums">{num(u.assigned)}</Td>
                  <Td className="text-right tabular-nums">
                    {num(u.contacted)}
                    {u.assigned > 0 && <span className="text-ink-faint"> · {Math.round((u.contacted / u.assigned) * 100)}%</span>}
                  </Td>
                  <Td className="text-right tabular-nums">{num(u.adoptedRecommendations)}</Td>
                  <Td className="text-right tabular-nums text-emerald-600 font-semibold">{num(u.won)}</Td>
                  <Td className="text-right tabular-nums">{num(u.signals30d)}</Td>
                  <Td className="text-ink-muted whitespace-nowrap">{ago(u.lastActiveAt)}</Td>
                  <Td className="text-right">
                    <DeleteRecord entity="user" id={u.id} name={u.name} deleted={false} canWrite={canWrite} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableWrap>
        <p className="text-[10.5px] text-ink-faint mt-1.5">
          &ldquo;Recs adopted&rdquo; = leads whose first contact happened while the lead sat in that rep&rsquo;s top-10 priority queue.
        </p>
      </section>

      {/* ── Workspaces + recent intake ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <SectionLabel right={<Link href={`/workspaces?account=${id}`} className="text-sky-600 font-semibold hover:text-sky-700">all →</Link>}>
            Workspaces · {c.workspaces.length}
          </SectionLabel>
          <div className="rounded-2xl border border-slate-200/70 bg-white divide-y divide-hairline overflow-hidden">
            {c.workspaces.length === 0 ? <EmptyState>No workspaces.</EmptyState> : c.workspaces.map((w) => (
              <div key={w.id} className="px-4 py-2.5 flex items-center justify-between">
                <p className="text-[13px] text-ink font-medium">
                  {w.name} {w.isDefault && <Pill tone="sky">default</Pill>}
                </p>
                <span className="flex items-center gap-3">
                  <span className="text-[12px] text-ink-muted tabular-nums">{num(w.leadCount)} leads</span>
                  <DeleteRecord entity="workspace" id={w.id} name={w.name} deleted={false} canWrite={canWrite} />
                </span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionLabel right={<Link href={`/intake?account=${id}`} className="text-sky-600 font-semibold hover:text-sky-700">all →</Link>}>
            Recent intake sessions
          </SectionLabel>
          <div className="rounded-2xl border border-slate-200/70 bg-white divide-y divide-hairline overflow-hidden">
            {intakeSessions.length === 0 ? <EmptyState>No intake sessions.</EmptyState> : intakeSessions.map((s) => (
              <Link key={s.id} href={`/intake/${s.id}`} className="px-4 py-2.5 flex items-center justify-between hover:bg-sky-50/60 transition-colors">
                <div className="min-w-0">
                  <p className="text-[12.5px] text-ink font-medium">
                    {num(s.rows)} rows · {s.columns} cols
                    <span className="text-ink-muted font-normal"> · {s.source.replace(/_/g, " ").toLowerCase()}</span>
                  </p>
                  <p className="text-[11px] text-ink-muted">{ago(s.createdAt)}{s.userName && ` · ${s.userName}`}</p>
                </div>
                <Pill tone={s.state === "COMPLETED" ? "emerald" : s.state === "FAILED" ? "red" : ["ABANDONED", "CANCELLED"].includes(s.state) ? "amber" : "sky"}>
                  {STATE_LABELS[s.state]}
                </Pill>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* ── Health evidence + flags ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <SectionLabel>
            Health · <span className={healthTone(health.band) === "emerald" ? "text-emerald-600" : healthTone(health.band) === "amber" ? "text-orange-600" : "text-red-600"}>{health.band}</span>
          </SectionLabel>
          <Card>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[28px] font-semibold tabular-nums text-ink">{health.score}</span>
              <div className="flex-1"><Bar pct={health.score} tone={healthTone(health.band)} height="h-2.5" /></div>
              <Pill tone={riskTone(health.churnRisk)}>{health.churnRisk} risk</Pill>
            </div>
            {health.reasons.length === 0 ? (
              <p className="text-[13px] text-emerald-700 font-semibold">Every health signal is positive.</p>
            ) : (
              <ul className="space-y-1.5">
                {health.reasons.map((r) => (
                  <li key={r} className="text-[12.5px] text-ink-soft flex items-center gap-2">
                    <Dot tone="amber" />{r}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10.5px] text-ink-faint mt-3 leading-snug">
              Weighted over 14 days: imports 20 · active users 20 · recommendation adoption 20 · activity 25 · brief opens 15.
              Nothing hidden — each missing input is listed above.
            </p>
          </Card>
        </section>

        <section>
          <SectionLabel>Danger zone</SectionLabel>
          <Card>
            <DeleteRecord
              entity="account"
              id={c.account.id}
              name={c.account.name}
              deleted={Boolean(c.account.deletedAt)}
              canWrite={canWrite}
            />
            <p className="mt-2.5 text-[10.5px] leading-snug text-ink-faint">
              A soft delete. Sign-in stops for every user on the account and it leaves the admin
              lists, but no row is erased — restore puts it back exactly as it was.
            </p>
          </Card>
        </section>

        <section>
          <SectionLabel right={<Link href="/system/flags" className="text-sky-600 font-semibold hover:text-sky-700">all accounts →</Link>}>
            Feature flags
          </SectionLabel>
          <FlagToggles accountId={c.account.id} items={flagItems} canWrite={canWrite} />
          <p className="text-[10.5px] text-ink-faint mt-1.5 leading-snug">
            Toggles are recorded and audited. Note the product does not consume <code className="text-ink-muted">isFeatureEnabled</code> yet,
            so today a flag changes what admin reports, not what the customer sees.
          </p>
        </section>
      </div>

      {/* ── Timeline ── */}
      <section>
        <SectionLabel right={<Link href={`/audit?account=${id}`} className="text-sky-600 font-semibold hover:text-sky-700">audit log →</Link>}>
          Timeline
        </SectionLabel>
        <Card><Timeline events={timeline} /></Card>
      </section>

      {/* ── Revenue history ── */}
      <section>
        <SectionLabel
          right={<Link href={`/billing/payments?account=${id}`} className="text-sky-600 font-semibold hover:text-sky-700">payments &amp; invoices →</Link>}
        >
          Revenue history
        </SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
          <Stat label="MRR now" value={revenue.currentMrrInr > 0 ? inr(revenue.currentMrrInr) : "—"} tone="emerald" />
          <Stat label="Peak MRR" value={revenue.peakMrrInr == null ? "—" : inr(revenue.peakMrrInr)} sub="as far back as events go" />
          <Stat label="Collected" value={inr(revenue.lifetimeCollectedInr)} tone="emerald" sub={`${num(revenue.paymentCount)} payment${revenue.paymentCount === 1 ? "" : "s"}`} />
          <Stat label="Refunded" value={revenue.refundedInr > 0 ? `−${inr(revenue.refundedInr)}` : inr(0)} tone={revenue.refundedInr > 0 ? "amber" : "slate"} />
          <Stat label="Invoices" value={num(revenue.invoiceCount)} />
        </div>
        <Card>
          {revenue.entries.length === 0 ? (
            <p className="text-[13px] text-ink-muted">
              No plan change or payment has ever been recorded for this account.
            </p>
          ) : (
            <ol className="relative border-l border-hairline-strong ml-1.5 space-y-3">
              {revenue.entries.map((e) => (
                <li key={e.id} className="ml-4">
                  <span className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ${
                    e.kind === "payment" ? (e.amountInr != null && e.amountInr < 0 ? "bg-orange-400" : "bg-emerald-500")
                    : e.kind === "payment-failed" ? "bg-red-500"
                    : e.kind === "invoice" ? "bg-sky-500"
                    : e.kind === "trial" ? "bg-orange-400" : "bg-violet-500"
                  }`} />
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[12.5px] text-ink-soft min-w-0">
                      <span className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-muted mr-2">{e.kind}</span>
                      <span className="font-semibold text-ink">{e.summary}</span>
                      {e.mrrInr != null && (
                        <span className="text-ink-muted"> — MRR {inr(e.mrrInr)}</span>
                      )}
                      {e.mrrInr == null && e.kind === "plan" && (
                        <span className="text-orange-600"> — MRR could not be resolved from this event</span>
                      )}
                      {e.deltaInr != null && e.deltaInr !== 0 && (
                        <span className={`font-bold ml-1.5 ${e.deltaInr > 0 ? "text-emerald-600" : "text-red-600"}`}>
                          ({e.deltaInr > 0 ? "+" : "−"}{inr(Math.abs(e.deltaInr))})
                        </span>
                      )}
                      {e.amountInr != null && (
                        <span className={`font-bold ml-1.5 ${e.amountInr < 0 ? "text-orange-600" : "text-emerald-600"}`}>
                          {e.amountInr < 0 ? "−" : ""}{inr(Math.abs(e.amountInr))}
                        </span>
                      )}
                      {e.pdfUrl && (
                        <a href={e.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-sky-600 font-semibold ml-1.5 hover:text-sky-700">
                          PDF
                        </a>
                      )}
                    </p>
                    <span className="text-[10.5px] text-ink-muted shrink-0 tabular-nums whitespace-nowrap">
                      {e.reference && <span className="font-mono text-ink-faint mr-2">{e.reference}</span>}
                      {dateTime(e.at)}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <p className="text-[10.5px] text-ink-faint mt-3 leading-snug">
            Rebuilt from account events plus the payment and invoice tables — there is no stored MRR history, since{" "}
            <code>subscriptions.mrr_inr</code> is overwritten on every change.
            {revenue.unresolved > 0 && (
              <span className="text-orange-600 font-semibold">
                {" "}{revenue.unresolved} plan event{revenue.unresolved === 1 ? "" : "s"} could not be resolved to a
                rupee figure and {revenue.unresolved === 1 ? "is" : "are"} shown as unknown rather than ₹0.
              </span>
            )}
          </p>
        </Card>
      </section>

      {/* ── Billing ── */}
      <section className="max-w-xl">
        <SectionLabel right={sub ? sub.status : "no subscription"}>Billing</SectionLabel>
        <PlanEditor accountId={c.account.id} plans={planOptions} current={currentSub} canWrite={canWrite} />
        <p className="text-[10.5px] text-ink-faint mt-1.5">
          The manual founder path. Razorpay webhooks write the same rows and are the source of truth when a provider
          subscription exists — editing here does not change anything at the provider.
        </p>
      </section>

      {/* ── Danger zone ──
          Deliberately the only place in the product where an account can be
          destroyed. The customer app has no self serve delete, so this is it. */}
      {canWrite && (
        <section className="max-w-xl">
          <SectionLabel right="permanent">Danger zone</SectionLabel>
          <DeleteAccountButton
            accountId={c.account.id}
            accountName={c.account.name}
            leadCount={c.usage.leads}
            userCount={team.length}
          />
          <p className="text-[10.5px] text-ink-faint mt-1.5">
            Removes every lead, workspace, note, signal and invoice under this account, and the users&rsquo; logins.
            A record of the deletion is posted to the admin Slack before anything is removed, because the account&rsquo;s
            own event history is one of the things being destroyed.
          </p>
        </section>
      )}
    </div>
  )
}
