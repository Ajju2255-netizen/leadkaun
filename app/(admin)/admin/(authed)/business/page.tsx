import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { getBusinessScorecard, PERIOD_OPTIONS } from "@/lib/admin/business"
import { FilterBar, type SelectFilter } from "../_components/FilterBar"
import {
  PageHeader, Card, Stat, SectionLabel, Bar, BarRow, Pill, EmptyState,
  TableWrap, THead, TBody, Th, Td, Tr, num, inr, ago, dateOnly, dateTime, pctOrDash,
} from "../_components/ui"

export const dynamic = "force-dynamic"

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined

const PERIOD: SelectFilter[] = [
  { param: "period", label: "Last 30 days", options: PERIOD_OPTIONS },
]

/** ±N% against the equally-long window before this one. */
function Delta({ pct, prev, label }: { pct: number | null; prev: number | null; label: string }) {
  if (pct == null) {
    return (
      <span className="text-[11px] text-ink-faint ml-1.5">
        {prev == null ? "no prior period" : prev === 0 ? `up from 0 ${label}` : ""}
      </span>
    )
  }
  if (pct === 0) return <span className="text-[11px] text-ink-muted ml-1.5">→ flat vs previous</span>
  const up = pct > 0
  return (
    <span className={`text-[11px] font-bold ml-1.5 ${up ? "text-emerald-600" : "text-red-600"}`}>
      {up ? "↑" : "↓"} {Math.abs(pct)}% vs previous ({num(prev)})
    </span>
  )
}

/** A simple month-by-month column chart. Bars are relative to the tallest month. */
function MonthBars({
  points, valueOf, format, tone,
}: {
  points: { month: string; label: string; count: number; amountInr: number }[]
  valueOf: (p: { count: number; amountInr: number }) => number
  format: (n: number) => string
  tone: "sky" | "emerald"
}) {
  const max = Math.max(1, ...points.map(valueOf))
  return (
    <div className="flex items-end gap-1.5 h-32">
      {points.map((p) => {
        const v = valueOf(p)
        const h = Math.round((v / max) * 100)
        return (
          <div key={p.month} className="flex-1 flex flex-col items-center gap-1 group">
            <span className="text-[10px] tabular-nums text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity">
              {format(v)}
            </span>
            <div className="w-full flex items-end" style={{ height: "84px" }}>
              <div
                className={`w-full rounded-t-md ${tone === "sky" ? "bg-gradient-to-t from-sky-400 to-sky-300" : "bg-gradient-to-t from-emerald-400 to-emerald-300"} ${v === 0 ? "bg-slate-200 bg-none" : ""}`}
                style={{ height: `${Math.max(v === 0 ? 2 : 6, h)}%` }}
                title={`${p.label}: ${format(v)}`}
              />
            </div>
            <span className="text-[9.5px] text-ink-faint whitespace-nowrap">{p.label}</span>
          </div>
        )
      })}
    </div>
  )
}

export default async function BusinessPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const b = await getBusinessScorecard(one(searchParams.period))
  const { period, signups, users, accountMix: mix, revenue: rev, churn, trends } = b

  return (
    <div className="space-y-7">
      <PageHeader
        title="Business"
        subtitle="The company scorecard: who signed up, how many users, what the account mix is, and what has actually been collected — over whatever window you choose."
        right={<span className="text-[12px] text-ink-muted">{period.label}</span>}
      />

      <FilterBar filters={PERIOD} showSearch={false} />

      {/* ── Headline ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">Signups · {period.label.toLowerCase()}</p>
          <p className="text-[28px] font-black tabular-nums text-sky-600 leading-none mt-1">{num(signups.inPeriod)}</p>
          <p className="mt-1"><Delta pct={signups.deltaPct} prev={signups.prevPeriod} label="signups" /></p>
          <p className="text-[10.5px] text-ink-faint mt-1">{num(signups.total)} accounts all time</p>
        </Card>
        <Card>
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">New users · {period.label.toLowerCase()}</p>
          <p className="text-[28px] font-black tabular-nums text-sky-600 leading-none mt-1">{num(users.inPeriod)}</p>
          <p className="mt-1"><Delta pct={users.deltaPct} prev={users.prevPeriod} label="users" /></p>
          <p className="text-[10.5px] text-ink-faint mt-1">{num(users.total)} users all time</p>
        </Card>
        <Stat label="Paying accounts" value={num(mix.paid)} tone="emerald" sub={`${pctOrDash(mix.paidPct)} of all accounts`} />
        <Stat label="Free accounts" value={num(mix.free)} sub={`${pctOrDash(mix.freePct)} of all accounts`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="MRR" value={inr(rev.mrrInr)} tone="emerald" sub="from active subscriptions" />
        <Stat label="ARR" value={inr(rev.arrInr)} tone="emerald" sub="MRR × 12" />
        <Stat label="ARPA" value={rev.arpaInr == null ? "—" : inr(rev.arpaInr)} sub="MRR ÷ paying accounts" />
        <Stat
          label={`Collected · ${period.label.toLowerCase()}`}
          value={rev.hasPaymentData ? inr(rev.collectedInPeriodInr) : "—"}
          tone="emerald"
          sub={rev.hasPaymentData ? `${num(rev.paymentsInPeriod)} payment${rev.paymentsInPeriod === 1 ? "" : "s"}` : "no payments recorded"}
        />
      </div>

      {/* ── New signups: who ── */}
      <section>
        <SectionLabel right={`${num(b.newSignups.length)} shown · newest first`}>
          Who signed up {period.key === "all" ? "(most recent)" : `· ${period.label.toLowerCase()}`}
        </SectionLabel>
        {b.newSignups.length === 0 ? (
          <Card><EmptyState>No signups in this window.</EmptyState></Card>
        ) : (
          <TableWrap>
            <table className="w-full text-left min-w-[900px]">
              <THead>
                <Th>Company</Th>
                <Th>Owner</Th>
                <Th>Plan</Th>
                <Th>Source</Th>
                <Th className="text-right">Users</Th>
                <Th className="text-right">Leads</Th>
                <Th>Activated</Th>
                <Th>Signed up</Th>
              </THead>
              <TBody>
                {b.newSignups.map((s) => (
                  <Tr key={s.id}>
                    <Td>
                      <Link href={`/admin/accounts/${s.id}`} className="block group">
                        <p className="text-[13px] font-bold text-ink group-hover:text-sky-600 transition-colors">{s.name}</p>
                        <p className="text-[11px] text-ink-muted">{[s.industry, s.city].filter(Boolean).join(" · ")}</p>
                      </Link>
                    </Td>
                    <Td>
                      {s.ownerEmail ? (
                        <>
                          <p className="text-[12.5px] text-ink">{s.ownerName || "—"}</p>
                          <p className="text-[11px] text-ink-muted">{s.ownerEmail}</p>
                        </>
                      ) : <span className="text-ink-faint">no admin user</span>}
                    </Td>
                    <Td>
                      {s.isPaid
                        ? <Pill tone="emerald">{s.planName}</Pill>
                        : <span className="text-ink-muted">{s.planName}</span>}
                    </Td>
                    <Td className="text-ink-muted">{s.source ?? <span className="text-ink-faint">direct</span>}</Td>
                    <Td className="text-right tabular-nums">{s.users}</Td>
                    <Td className="text-right tabular-nums">{num(s.leads)}</Td>
                    <Td>{s.activated ? <Pill tone="emerald">yes</Pill> : <Pill tone="slate">not yet</Pill>}</Td>
                    <Td className="text-ink-muted whitespace-nowrap">
                      {dateOnly(s.createdAt)}<span className="text-ink-faint"> · {ago(s.createdAt)}</span>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableWrap>
        )}
      </section>

      {/* ── Account mix ── */}
      <section>
        <SectionLabel right={mix.reconciles ? "free + trialing + paid = total ✓" : undefined}>
          Account mix · {num(mix.total)} accounts
        </SectionLabel>

        {!mix.reconciles && (
          <div className="rounded-2xl border border-red-200 bg-red-50/70 px-5 py-3 mb-3 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-red-800">
              These buckets do not add up to {num(mix.total)} accounts. Treat the mix as unreliable and check for
              subscription rows pointing at deleted accounts.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
          <Stat label="Free" value={num(mix.free)} sub="no plan, trial plan, or cancelled" />
          <Stat label="— no plan set" value={num(mix.freeNoSubscription)} sub="no subscription row at all" />
          <Stat label="— on Free plan" value={num(mix.freeOnTrialPlan)} />
          <Stat label="— cancelled" value={num(mix.cancelled)} tone={mix.cancelled > 0 ? "amber" : "slate"} />
          <Stat label="Trialing" value={num(mix.trialing)} tone="sky" sub="paid plan, not charged yet" />
          <Stat label="Paying" value={num(mix.paid)} tone="emerald" sub={mix.pastDue > 0 ? `+${mix.pastDue} past due` : undefined} />
        </div>

        <TableWrap>
          <table className="w-full text-left min-w-[720px]">
            <THead>
              <Th>Plan</Th>
              <Th className="text-right">Price / mo</Th>
              <Th className="text-right">Accounts</Th>
              <Th className="w-48">Share</Th>
              <Th className="text-right">MRR</Th>
            </THead>
            <TBody>
              {mix.byPlan.map((p) => (
                <Tr key={p.key}>
                  <Td>
                    <span className="text-[13px] font-bold text-ink">{p.name}</span>
                    {p.isPaid && <Pill tone="emerald">paid</Pill>}
                    {p.note && <p className="text-[10.5px] text-ink-muted mt-0.5">{p.note}</p>}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {p.priceInr > 0
                      ? inr(p.priceInr)
                      : <span className="text-ink-faint">{p.isPaid ? "Custom" : "Free"}</span>}
                  </Td>
                  <Td className="text-right tabular-nums font-bold text-ink">{num(p.accounts)}</Td>
                  <Td><Bar pct={p.pctOfAccounts} tone={p.isPaid ? "emerald" : "slate"} /></Td>
                  <Td className="text-right tabular-nums">
                    {p.mrrInr > 0 ? <span className="text-emerald-600 font-semibold">{inr(p.mrrInr)}</span> : <span className="text-ink-faint">—</span>}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableWrap>
        <p className="text-[10.5px] text-ink-faint mt-2 leading-snug">
          Counted from the account list outward, so every account lands in exactly one bucket — including the ones
          with no subscription row, which a plan-table-only count would silently omit.
        </p>
      </section>

      {/* ── Users ── */}
      <section>
        <SectionLabel right={<Link href="/admin/users" className="text-sky-600 font-semibold hover:text-sky-700">all users →</Link>}>
          Users
        </SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="grid grid-cols-2 gap-3 content-start">
            <Stat label="Total users" value={num(users.total)} />
            <Stat label="Avg per account" value={users.avgPerAccount == null ? "—" : String(users.avgPerAccount)} />
            <Stat label="Active" value={num(users.active)} tone="emerald" />
            <Stat label="Invited, pending" value={num(users.invited)} tone={users.invited > 0 ? "amber" : "slate"} sub="still holds a seat" />
            <Stat label="Deactivated" value={num(users.deactivated)} sub="seat freed" />
            <Stat label={`New · ${period.label.toLowerCase()}`} value={num(users.inPeriod)} tone="sky" />
          </div>
          <Card>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2.5">By role</p>
            <div className="space-y-2">
              {users.byRole.map((r) => (
                <BarRow
                  key={r.role} label={r.role} count={r.count}
                  pct={users.total ? Math.round((r.count / users.total) * 100) : 0}
                  tone={r.role === "ADMIN" ? "sky" : r.role === "MANAGER" ? "violet" : "slate"}
                />
              ))}
            </div>
          </Card>
        </div>
      </section>

      {/* ── Revenue ── */}
      <section>
        <SectionLabel right={<Link href="/admin/billing" className="text-sky-600 font-semibold hover:text-sky-700">subscriptions →</Link>}>
          Revenue
        </SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="Paying now" value={num(rev.payingAccounts)} tone="emerald" sub="active, priced plan" />
          <Stat label="Ever paid" value={num(rev.everPaidAccounts)} sub="≥1 succeeded payment" />
          <Stat label="Collected all time" value={rev.hasPaymentData ? inr(rev.collectedAllTimeInr) : "—"} tone="emerald" />
          <Stat label="Cancelled" value={num(churn.cancelledTotal)} tone={churn.cancelledTotal > 0 ? "amber" : "slate"} sub={`${num(churn.cancelledInPeriod)} in period`} />
          <Stat label="Churn" value={pctOrDash(churn.churnPct)} tone={churn.churnPct && churn.churnPct > 10 ? "red" : "slate"} sub="cancelled / ever-active" />
          <Stat
            label="Active but ₹0 MRR" value={num(rev.activeButZeroMrr)}
            tone={rev.activeButZeroMrr > 0 ? "amber" : "slate"} sub="check the plan editor"
          />
        </div>

        <Card className="mt-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">Last payment</p>
          {rev.lastPayment ? (
            <p className="text-[13px] text-ink">
              <span className="font-black tabular-nums text-emerald-600">{inr(rev.lastPayment.amountInr)}</span>
              {" from "}
              <Link href={`/admin/accounts/${rev.lastPayment.accountId}`} className="font-bold text-sky-600 hover:text-sky-700">
                {rev.lastPayment.accountName}
              </Link>
              {" · "}<span className="text-ink-soft">{dateTime(rev.lastPayment.at)}</span>
              {" · "}<span className="text-ink-muted">{ago(rev.lastPayment.at)}</span>
              {rev.lastPayment.status !== "succeeded" && <Pill tone="red">{rev.lastPayment.status}</Pill>}
            </p>
          ) : (
            <p className="text-[12.5px] text-ink-muted leading-relaxed">
              No payment has ever been recorded. <span className="font-semibold text-ink-soft">MRR above is not money received</span> —
              it comes from <code>subscriptions.mrr_inr</code>, which the Account 360 plan editor sets by hand. Payment
              and Invoice rows are only written by the Razorpay <code>subscription.charged</code> webhook, so this stays
              empty until a provider-backed subscription actually charges.
            </p>
          )}
        </Card>
      </section>

      {/* ── Trends ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <SectionLabel right="last 12 months · IST">Signups by month</SectionLabel>
          <Card>
            <MonthBars points={trends.signupsByMonth} valueOf={(p) => p.count} format={(n) => String(n)} tone="sky" />
          </Card>
        </section>
        <section>
          <SectionLabel right="money actually collected">Revenue by month</SectionLabel>
          <Card>
            {trends.hasRevenueHistory ? (
              <MonthBars points={trends.revenueByMonth} valueOf={(p) => p.amountInr} format={inr} tone="emerald" />
            ) : (
              <div className="h-32 flex items-center justify-center text-center px-4">
                <p className="text-[12.5px] text-ink-muted leading-relaxed">
                  No collected revenue to plot. This chart reads the <code>payments</code> table, which only the
                  Razorpay webhook writes — manually-set plans contribute to MRR but never appear here.
                </p>
              </div>
            )}
          </Card>
        </section>
      </div>
    </div>
  )
}
