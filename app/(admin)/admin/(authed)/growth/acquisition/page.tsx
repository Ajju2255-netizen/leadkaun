import { getAcquisition } from "@/lib/admin/growth"
import {
  PageHeader, Card, Stat, SectionLabel, BarRow, EmptyState,
  TableWrap, THead, TBody, Th, Td, Tr, num, inr, pctOrDash, NotWired,
} from "../../_components/ui"

export const metadata = { title: "Acquisition" }

export const dynamic = "force-dynamic"

function SourceTable({ rows, label }: { rows: Awaited<ReturnType<typeof getAcquisition>>["bySource"]; label: string }) {
  return (
    <TableWrap>
      <table className="w-full text-left min-w-[680px]">
        <THead>
          <Th>{label}</Th>
          <Th className="text-right">Signups</Th>
          <Th className="text-right">Imported</Th>
          <Th className="text-right">Activated</Th>
          <Th className="text-right">Activation %</Th>
          <Th className="text-right">Paid</Th>
          <Th className="text-right">MRR</Th>
        </THead>
        <TBody>
          {rows.length === 0 ? (
            <tr><td colSpan={7}><EmptyState>Nothing recorded.</EmptyState></td></tr>
          ) : rows.map((r) => (
            <Tr key={r.key}>
              <Td className="font-semibold text-ink">{r.label}</Td>
              <Td className="text-right tabular-nums font-bold text-ink">{num(r.signups)}</Td>
              <Td className="text-right tabular-nums">{num(r.imported)}</Td>
              <Td className="text-right tabular-nums">{num(r.activated)}</Td>
              <Td className="text-right tabular-nums">
                {r.activationPct == null ? <span className="text-ink-faint">—</span> : (
                  <span className={r.activationPct >= 40 ? "text-emerald-600 font-bold" : "text-ink"}>{r.activationPct}%</span>
                )}
              </Td>
              <Td className="text-right tabular-nums">
                {num(r.paid)}{r.paidPct ? <span className="text-ink-faint"> · {r.paidPct}%</span> : null}
              </Td>
              <Td className="text-right tabular-nums text-emerald-600 font-semibold">
                {r.mrrInr > 0 ? inr(r.mrrInr) : <span className="text-ink-faint font-normal">—</span>}
              </Td>
            </Tr>
          ))}
        </TBody>
      </table>
    </TableWrap>
  )
}

export default async function AcquisitionPage() {
  const a = await getAcquisition()
  const attributedPct = a.total > 0 ? Math.round((a.attributed / a.total) * 100) : null

  return (
    <div className="space-y-7">
      <PageHeader
        title="Acquisition"
        subtitle="Where accounts came from, and whether that origin predicts anything useful — activation and revenue, not just volume."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Accounts" value={num(a.total)} />
        <Stat label="Attributed" value={num(a.attributed)} tone={attributedPct != null && attributedPct >= 50 ? "emerald" : "amber"} sub={pctOrDash(attributedPct)} />
        <Stat label="Unattributed" value={num(a.unattributed)} sub="no UTM captured at signup" />
        <Stat label="Distinct sources" value={num(a.bySource.length)} />
      </div>

      <NotWired>
        <p className="text-[12px] text-ink-soft leading-relaxed">
          <span className="font-bold text-ink">CAC and LTV are not shown, because they cannot be computed here.</span>{" "}
          CAC needs ad spend, which lives in Meta/Google and is not connected. LTV needs a retention curve over a
          meaningful number of churned paying accounts. Both would be guesses today, and a guessed CAC is worse than
          no CAC. What <em>is</em> real: signups, activation rate and MRR per source, below.
        </p>
      </NotWired>

      <section>
        <SectionLabel right="which channels produce customers, not just signups">By source</SectionLabel>
        <SourceTable rows={a.bySource} label="UTM source" />
      </section>

      <section>
        <SectionLabel>By campaign</SectionLabel>
        <SourceTable rows={a.byCampaign} label="UTM campaign" />
      </section>

      <section>
        <SectionLabel right="captured at registration">By country</SectionLabel>
        <Card>
          {a.byCountry.length === 0 ? <p className="text-[13px] text-ink-muted">No country recorded.</p> : (
            <div className="space-y-2">
              {a.byCountry.map((c) => (
                <BarRow key={c.key} label={c.label} count={c.count} pct={c.pct} tone={c.key === "Unknown" ? "slate" : "sky"} />
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  )
}
