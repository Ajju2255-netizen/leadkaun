import Link from "next/link"
import { getRevenue } from "@/lib/admin/billing"
import { listSubscriptions, listPlansWithUptake, listPayments } from "@/lib/admin/subscriptions"
import { getMrrMovement } from "@/lib/admin/revenue-history"
import {
  PageHeader, Card, Stat, SectionLabel, Pill, EmptyState,
  TableWrap, THead, TBody, Th, Td, Tr, num, inr, dateOnly, dateTime, pctOrDash,
} from "../_components/ui"

export const dynamic = "force-dynamic"

const STATUS_TONE = { active: "emerald", trialing: "sky", past_due: "amber", canceled: "slate" } as const

export default async function BillingPage() {
  const [r, subs, plans, payments, movement] = await Promise.all([
    getRevenue(), listSubscriptions(), listPlansWithUptake(), listPayments(25), getMrrMovement(12),
  ])
  const maxMove = Math.max(
    1,
    ...movement.months.map((m) => Math.max(m.newInr + m.expansionInr, m.churnInr + m.contractionInr)),
  )

  const unsellable = plans.filter((p) => !p.sellable && p.priceInr > 0)

  return (
    <div className="space-y-7">
      <PageHeader
        title="Subscriptions"
        subtitle="Razorpay webhooks are the source of truth for status, payments and invoices; the Account 360 plan editor writes the same rows manually for the cases a provider can't cover."
        right={
          <Link href="/admin/billing/usage" className="text-[12px] font-semibold text-sky-600 hover:text-sky-700">
            Usage &amp; limits →
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="MRR" value={inr(Math.round(r.mrrInr / 100))} tone="emerald" sub="active subscriptions" />
        <Stat label="ARR" value={inr(Math.round(r.arrInr / 100))} tone="emerald" sub="MRR × 12" />
        <Stat label="Paying" value={num(r.payingCustomers)} tone="emerald" />
        <Stat label="Trials" value={num(r.trials)} tone="sky" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Trial → paid" value={pctOrDash(r.conversionPct)} sub="active / all subscriptions" />
        <Stat label="Churn" value={pctOrDash(r.churnPct)} tone={r.churnPct && r.churnPct > 10 ? "red" : "slate"} sub={`${num(r.canceled)} cancelled`} />
        <Stat label="Payments recorded" value={num(payments.length)} sub={r.hasPayments ? "from webhooks" : "none yet"} />
        <Stat label="Invoices" value={r.hasInvoices ? "yes" : "none yet"} sub="written by the charged webhook" />
      </div>

      {unsellable.length > 0 && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50/70 px-5 py-3.5">
          <p className="text-[12.5px] font-bold text-orange-800">
            {unsellable.length} priced plan{unsellable.length === 1 ? " is" : "s are"} not sellable online:{" "}
            {unsellable.map((p) => p.name).join(", ")}
          </p>
          <p className="text-[11.5px] text-orange-700 mt-0.5">
            No <code>provider_plan_id</code> — run <code>scripts/razorpay-sync-plans.ts --commit</code> to create the
            Razorpay Plan entities. Until then the checkout button is disabled for those tiers.
          </p>
        </div>
      )}

      {/* ── Plans ── */}
      <section>
        <SectionLabel right="limits live on the plan, so a change applies to every subscriber at once">Plans</SectionLabel>
        <TableWrap>
          <table className="w-full text-left min-w-[720px]">
            <THead>
              <Th>Plan</Th>
              <Th className="text-right">Price / mo</Th>
              <Th className="text-right">Seats</Th>
              <Th className="text-right">Active-lead cap</Th>
              <Th>Sellable</Th>
              <Th className="text-right">Subscribers</Th>
              <Th className="text-right">MRR</Th>
            </THead>
            <TBody>
              {plans.map((p) => (
                <Tr key={p.key}>
                  <Td>
                    <span className="text-[13px] font-bold text-ink">{p.name}</span>
                    <span className="text-[11px] text-ink-muted font-mono ml-2">{p.key}</span>
                  </Td>
                  <Td className="text-right tabular-nums">{p.priceInr === 0 ? "Free" : inr(p.priceInr)}</Td>
                  <Td className="text-right tabular-nums">{p.maxSeats}</Td>
                  <Td className="text-right tabular-nums">{p.activeLeadLimit == null ? "unlimited" : num(p.activeLeadLimit)}</Td>
                  <Td>
                    {p.priceInr === 0
                      ? <span className="text-ink-faint">n/a</span>
                      : p.sellable ? <Pill tone="emerald">synced</Pill> : <Pill tone="amber">not synced</Pill>}
                  </Td>
                  <Td className="text-right tabular-nums font-semibold text-ink">{num(p.subscribers)}</Td>
                  <Td className="text-right tabular-nums text-emerald-600 font-semibold">
                    {p.mrrInr > 0 ? inr(p.mrrInr) : <span className="text-ink-faint font-normal">—</span>}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableWrap>
      </section>

      {/* ── Subscriptions ── */}
      <section>
        <SectionLabel right={`${num(subs.length)} subscription rows`}>Subscriptions</SectionLabel>
        <TableWrap>
          <table className="w-full text-left min-w-[900px]">
            <THead>
              <Th>Account</Th>
              <Th>Plan</Th>
              <Th>Status</Th>
              <Th className="text-right">MRR</Th>
              <Th>Provider</Th>
              <Th>Cycle</Th>
              <Th>Card</Th>
              <Th>Renews / trial ends</Th>
              <Th>Started</Th>
            </THead>
            <TBody>
              {subs.length === 0 ? (
                <tr><td colSpan={9}><EmptyState>No subscription rows yet — set a plan from any Account 360.</EmptyState></td></tr>
              ) : subs.map((s) => (
                <Tr key={s.accountId}>
                  <Td>
                    <Link href={`/admin/accounts/${s.accountId}`} className="text-[13px] font-bold text-ink hover:text-sky-600">
                      {s.accountName}
                    </Link>
                  </Td>
                  <Td className="font-semibold text-ink">{s.planName}</Td>
                  <Td><Pill tone={STATUS_TONE[s.status as keyof typeof STATUS_TONE] ?? "slate"}>{s.status}</Pill></Td>
                  <Td className="text-right tabular-nums font-semibold">{s.mrrInr > 0 ? inr(s.mrrInr) : <span className="text-ink-faint">—</span>}</Td>
                  <Td>
                    {s.provider
                      ? <span className="text-ink-soft">{s.provider}</span>
                      : <span className="text-ink-faint">manual</span>}
                  </Td>
                  <Td className="text-ink-muted">{s.billingCycle ?? "—"}</Td>
                  <Td className="text-ink-muted">{s.cardLabel ?? "—"}</Td>
                  <Td className="text-ink-muted whitespace-nowrap">
                    {s.periodEnd ? dateOnly(s.periodEnd) : s.trialEndsAt ? `trial ${dateOnly(s.trialEndsAt)}` : "—"}
                  </Td>
                  <Td className="text-ink-muted whitespace-nowrap">{dateOnly(s.startedAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableWrap>
        <p className="text-[10.5px] text-ink-faint mt-2">
          &ldquo;Manual&rdquo; means the row was written by the Account 360 plan editor and has no provider
          subscription behind it — cancelling at Razorpay will not change it, and it will not renew or charge.
        </p>
      </section>

      {/* ── MRR movement ── */}
      <section>
        <SectionLabel right="reconstructed from plan-change events — see the caveat below">
          MRR movement · last 12 months
        </SectionLabel>
        {!movement.hasData ? (
          <Card>
            <p className="text-[13px] text-ink-soft font-semibold">No plan changes have been recorded yet.</p>
            <p className="text-[12px] text-ink-muted mt-1 leading-relaxed">
              Movement is derived from <code>PLAN_CHANGED</code> account events. Once plans start changing — by
              webhook or from an Account 360 — new, expansion, contraction and churn appear here.
            </p>
          </Card>
        ) : (
          <Card>
            <div className="flex items-end gap-2 h-40">
              {movement.months.map((m) => {
                const up = m.newInr + m.expansionInr
                const down = m.churnInr + m.contractionInr
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col justify-end" style={{ height: "60px" }}>
                      {up > 0 && (
                        <div
                          className="w-full rounded-t-md bg-gradient-to-t from-emerald-400 to-emerald-300"
                          style={{ height: `${Math.max(6, (up / maxMove) * 100)}%` }}
                          title={`${m.label} · new ${inr(m.newInr)} · expansion ${inr(m.expansionInr)}`}
                        />
                      )}
                    </div>
                    <div className="w-full h-px bg-slate-300" />
                    <div className="w-full flex flex-col justify-start" style={{ height: "60px" }}>
                      {down > 0 && (
                        <div
                          className="w-full rounded-b-md bg-gradient-to-b from-red-400 to-red-300"
                          style={{ height: `${Math.max(6, (down / maxMove) * 100)}%` }}
                          title={`${m.label} · churn ${inr(m.churnInr)} · contraction ${inr(m.contractionInr)}`}
                        />
                      )}
                    </div>
                    <span className="text-[9.5px] text-ink-faint whitespace-nowrap">{m.label}</span>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-[11px] text-ink-muted">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" /> new + expansion</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> churn + contraction</span>
              <span className="ml-auto tabular-nums">
                {num(movement.accountsCovered)} account{movement.accountsCovered === 1 ? "" : "s"} walked
                {movement.unresolved > 0 && (
                  <span className="text-orange-600 font-semibold">
                    {" · "}{num(movement.unresolved)} event{movement.unresolved === 1 ? "" : "s"} unresolved
                  </span>
                )}
              </span>
            </div>
            <p className="text-[10.5px] text-ink-faint mt-2 leading-snug">
              <span className="font-semibold text-ink-soft">This is a reconstruction, not a stored series.</span>{" "}
              <code>subscriptions.mrr_inr</code> is overwritten on every change, so there is no MRR history to read.
              Each <code>PLAN_CHANGED</code> event is resolved to a rupee figure — from its own{" "}
              <code>mrrRupees</code> on the manual path, or from the plan price on the webhook path — and the deltas
              are bucketed by month. History reaches back only as far as the event stream
              {movement.earliestAt && <> ({dateOnly(movement.earliestAt)})</>}, and any event that cannot be resolved
              is counted as unresolved rather than assumed to be ₹0, which would invent a churn.
            </p>
          </Card>
        )}
      </section>

      {/* ── Payments ── */}
      <section>
        <SectionLabel
          right={<Link href="/admin/billing/payments" className="text-sky-600 font-semibold hover:text-sky-700">payments &amp; invoices →</Link>}
        >
          Recent payments
        </SectionLabel>
        {payments.length === 0 ? (
          <Card>
            <p className="text-[13px] text-ink-soft font-semibold">No payments recorded.</p>
            <p className="text-[12px] text-ink-muted mt-1 leading-relaxed">
              Payment and Invoice rows are written only by the Razorpay webhook, and only on a settled charge. An
              empty table with live subscriptions means either every plan is manual, or the webhook endpoint
              (<code>/api/billing/webhook</code>) is not receiving deliveries.
            </p>
          </Card>
        ) : (
          <TableWrap>
            <table className="w-full text-left min-w-[620px]">
              <THead>
                <Th>Account</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th>Provider</Th>
                <Th>Reference</Th>
                <Th>When</Th>
              </THead>
              <TBody>
                {payments.map((p) => (
                  <Tr key={p.id}>
                    <Td>
                      <Link href={`/admin/accounts/${p.accountId}`} className="font-bold text-ink hover:text-sky-600">
                        {p.accountName}
                      </Link>
                    </Td>
                    <Td className="text-right tabular-nums font-semibold text-emerald-600">{inr(p.amountInr)}</Td>
                    <Td><Pill tone={p.status === "succeeded" ? "emerald" : p.status === "refunded" ? "amber" : "red"}>{p.status}</Pill></Td>
                    <Td className="text-ink-muted">{p.provider ?? "manual"}</Td>
                    <Td className="font-mono text-[11px] text-ink-muted">{p.providerRef ?? "—"}</Td>
                    <Td className="text-ink-muted whitespace-nowrap">{dateTime(p.createdAt)}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableWrap>
        )}
      </section>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 px-5 py-3.5">
        <p className="text-[12px] text-ink-soft leading-relaxed">
          <span className="font-bold text-ink">Expansion, contraction and net-revenue-retention are not shown.</span>{" "}
          Each needs a history of MRR per account over time, and <code>subscriptions.mrr_inr</code> is a single
          current value that is overwritten on every plan change — the history was never kept. Computing them from
          what exists would produce a number that looks right and isn&rsquo;t.
        </p>
      </div>
    </div>
  )
}
