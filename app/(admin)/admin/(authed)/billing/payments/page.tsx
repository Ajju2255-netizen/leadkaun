import Link from "next/link"
import { FileText } from "lucide-react"
import { getPaymentLedger, listInvoices } from "@/lib/admin/subscriptions"
import { FilterBar, type SelectFilter } from "../../_components/FilterBar"
import {
  PageHeader, Card, Stat, SectionLabel, Pill, EmptyState,
  TableWrap, THead, TBody, Th, Td, Tr, num, inr, dateOnly, dateTime, BackLink,
} from "../../_components/ui"

export const metadata = { title: "Payments" }

export const dynamic = "force-dynamic"

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined

const FILTERS: SelectFilter[] = [
  {
    param: "status", label: "All payments",
    options: [
      { value: "succeeded", label: "Succeeded" },
      { value: "refunded", label: "Refunded" },
      { value: "failed", label: "Failed" },
    ],
  },
  {
    param: "days", label: "All time",
    options: [
      { value: "7", label: "Last 7 days" },
      { value: "30", label: "Last 30 days" },
      { value: "90", label: "Last 90 days" },
      { value: "365", label: "Last year" },
    ],
  },
]

const PAY_TONE: Record<string, "emerald" | "amber" | "red" | "slate"> = {
  succeeded: "emerald", refunded: "amber", failed: "red",
}
const INV_TONE: Record<string, "emerald" | "amber" | "slate"> = {
  paid: "emerald", open: "amber", void: "slate",
}

export default async function PaymentsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const status = one(searchParams.status)
  const days = one(searchParams.days) ? Number(one(searchParams.days)) : undefined
  const accountId = one(searchParams.account)

  const [ledger, invoices] = await Promise.all([
    getPaymentLedger({ status, days, accountId, take: 150 }),
    listInvoices({ accountId, take: 100 }),
  ])
  const t = ledger.totals

  return (
    <div className="space-y-7">
      <PageHeader
        title="Payments &amp; invoices"
        subtitle="Money that actually moved. Every row here was written by the Razorpay webhook — a manually-set plan produces MRR but never a payment, so this ledger and the MRR figure are allowed to disagree."
        right={
          <BackLink href="/billing">Subscriptions</BackLink>
        }
      />

      {!ledger.hasAny && invoices.rows.length === 0 ? (
        <Card>
          <p className="text-[13px] font-semibold text-ink-soft">No payment or invoice has ever been recorded.</p>
          <p className="text-[12px] text-ink-muted mt-1.5 leading-relaxed">
            Both tables are written only inside the <code>subscription.charged</code> handler in{" "}
            <code>/api/billing/webhook</code>, and only on a settled charge. If subscriptions are active but this stays
            empty, either every plan was set by hand from an Account 360, or Razorpay is not delivering webhooks —
            check <Link href="/ops/integrations" className="text-sky-600 font-semibold hover:text-sky-700">Integrations</Link>.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Stat label="Collected" value={inr(t.succeededInr)} tone="emerald" sub={`${num(t.succeededCount)} payment${t.succeededCount === 1 ? "" : "s"}`} />
            <Stat label="Refunded" value={t.refundedInr > 0 ? `−${inr(t.refundedInr)}` : inr(0)} tone={t.refundedInr > 0 ? "amber" : "slate"} sub={`${num(t.refundedCount)} refund${t.refundedCount === 1 ? "" : "s"}`} />
            <Stat label="Net kept" value={inr(t.netInr)} tone="emerald" sub="collected − refunded" />
            <Stat label="Failed" value={num(t.failedCount)} tone={t.failedCount > 0 ? "red" : "slate"} />
            <Stat label="Paying accounts" value={num(ledger.payingAccounts)} sub="≥1 succeeded payment" />
            <Stat label="Invoices paid" value={`${num(invoices.count)}`} sub={inr(invoices.totalInr)} />
          </div>

          {accountId && (
            <p className="text-[12px] text-ink-soft">
              Filtered to one account.{" "}
              <Link href="/billing/payments" className="text-sky-600 font-semibold hover:text-sky-700">Show all</Link>
            </p>
          )}

          <FilterBar filters={FILTERS} showSearch={false} />

          <section>
            <SectionLabel right={`${num(ledger.rows.length)} shown · totals above cover the whole ledger`}>
              Payments
            </SectionLabel>
            <TableWrap>
              <table className="w-full text-left min-w-[720px]">
                <THead>
                  <Th>Account</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Status</Th>
                  <Th>Provider</Th>
                  <Th>Reference</Th>
                  <Th>When</Th>
                </THead>
                <TBody>
                  {ledger.rows.length === 0 ? (
                    <tr><td colSpan={6}><EmptyState>No payments match these filters.</EmptyState></td></tr>
                  ) : ledger.rows.map((p) => (
                    <Tr key={p.id}>
                      <Td>
                        <Link href={`/accounts/${p.accountId}`} className="font-bold text-ink hover:text-sky-600">
                          {p.accountName}
                        </Link>
                      </Td>
                      <Td className={`text-right tabular-nums font-semibold ${p.status === "refunded" ? "text-orange-600" : p.status === "failed" ? "text-ink-muted" : "text-emerald-600"}`}>
                        {p.status === "refunded" ? `−${inr(p.amountInr)}` : inr(p.amountInr)}
                      </Td>
                      <Td><Pill tone={PAY_TONE[p.status] ?? "slate"}>{p.status}</Pill></Td>
                      <Td className="text-ink-muted">{p.provider ?? <span className="text-ink-faint">manual</span>}</Td>
                      <Td className="font-mono text-[11px] text-ink-muted">{p.providerRef ?? "—"}</Td>
                      <Td className="text-ink-muted whitespace-nowrap">{dateTime(p.createdAt)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </table>
            </TableWrap>
            <p className="text-[10.5px] text-ink-faint mt-1.5">
              A refund keeps its original positive amount in the database and is distinguished by{" "}
              <code>status = &lsquo;refunded&rsquo;</code>; it is rendered negative here so the column sums the way you
              would expect it to.
            </p>
          </section>

          <section>
            <SectionLabel right="serial numbers come from invoice_serial_seq — consecutive, no gaps">
              Invoices
            </SectionLabel>
            {invoices.rows.length === 0 ? (
              <Card><EmptyState>No invoices recorded.</EmptyState></Card>
            ) : (
              <TableWrap>
                <table className="w-full text-left min-w-[780px]">
                  <THead>
                    <Th>Number</Th>
                    <Th>Account</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Status</Th>
                    <Th>Period</Th>
                    <Th>Issued</Th>
                    <Th>PDF</Th>
                  </THead>
                  <TBody>
                    {invoices.rows.map((i) => (
                      <Tr key={i.id}>
                        <Td className="font-mono text-[12px] font-semibold text-ink">{i.number ?? i.id.slice(-8)}</Td>
                        <Td>
                          <Link href={`/accounts/${i.accountId}`} className="font-bold text-ink hover:text-sky-600">
                            {i.accountName}
                          </Link>
                        </Td>
                        <Td className="text-right tabular-nums font-semibold">{inr(i.amountInr)}</Td>
                        <Td><Pill tone={INV_TONE[i.status] ?? "slate"}>{i.status}</Pill></Td>
                        <Td className="text-ink-muted whitespace-nowrap">
                          {i.periodStart && i.periodEnd
                            ? `${dateOnly(i.periodStart)} – ${dateOnly(i.periodEnd)}`
                            : <span className="text-ink-faint">—</span>}
                        </Td>
                        <Td className="text-ink-muted whitespace-nowrap">{dateOnly(i.createdAt)}</Td>
                        <Td>
                          {i.pdfUrl ? (
                            <a
                              href={i.pdfUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-sky-600 hover:text-sky-700"
                            >
                              <FileText className="w-3.5 h-3.5" /> open
                            </a>
                          ) : <span className="text-ink-faint">—</span>}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </table>
              </TableWrap>
            )}
          </section>
        </>
      )}
    </div>
  )
}
