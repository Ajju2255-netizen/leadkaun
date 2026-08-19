import { getUsageTable } from "@/lib/admin/subscriptions"
import {
  PageHeader, Card, Stat, SectionLabel, Bar, Pill, EmptyState,
  TableWrap, THead, TBody, Th, Td, Tr, num, RowLink, Dot,
} from "../../_components/ui"

export const metadata = { title: "Usage" }

export const dynamic = "force-dynamic"

export default async function UsagePage() {
  const { rows, blocked, warning } = await getUsageTable()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usage &amp; limits"
        subtitle="Every account against the caps that are actually enforced. Accounts with no subscription — or a cancelled one — fall back to the Free tier's caps, exactly as the enforcement code does."
        right={
          blocked > 0
            ? <Pill tone="red">{blocked} blocked</Pill>
            : warning > 0 ? <Pill tone="amber">{warning} approaching</Pill> : <Pill tone="emerald">all within limits</Pill>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Accounts" value={num(rows.length)} />
        <Stat label="Blocked" value={num(blocked)} tone={blocked > 0 ? "red" : "slate"} sub="at a hard cap" />
        <Stat label="Approaching" value={num(warning)} tone={warning > 0 ? "amber" : "slate"} sub="≥80% of a cap" />
        <Stat label="Within limits" value={num(rows.length - blocked - warning)} tone="emerald" />
      </div>

      <Card>
        <p className="text-[12px] text-ink-soft leading-relaxed">
          <span className="font-bold text-ink">The lead cap is a soft paywall, not a lockout.</span> At 100% every
          existing lead stays fully usable — view, edit, call, close, export. Only <em>adding</em> a new lead is
          blocked, and winning, losing or junking a deal frees a slot immediately. The seat cap is harder: at the
          limit an invite returns 409 before the email is sent.
        </p>
      </Card>

      <section>
        <SectionLabel right="worst first">Per-account usage</SectionLabel>
        <TableWrap>
          <table className="w-full text-left min-w-[880px]">
            <THead>
              <Th className="w-8"><span className="sr-only">Status</span></Th>
              <Th>Account</Th>
              <Th>Plan</Th>
              <Th>Seats</Th>
              <Th className="w-40">Seat usage</Th>
              <Th>Active leads</Th>
              <Th className="w-40">Lead usage</Th>
              <Th className="text-right">Imported this month</Th>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <tr><td colSpan={8}><EmptyState>No accounts.</EmptyState></td></tr>
              ) : rows.map((r) => (
                <Tr key={r.accountId} href={`/accounts/${r.accountId}`}>
                  <Td>
                    <Dot tone={r.status === "blocked" ? "red" : r.status === "warning" ? "amber" : "emerald"} />
                  </Td>
                  <Td>
                    <RowLink href={`/accounts/${r.accountId}`} className="text-[13px] font-bold text-ink hover:text-sky-600">
                      {r.accountName}
                    </RowLink>
                  </Td>
                  <Td className="text-ink-soft font-semibold">{r.planName}</Td>
                  <Td className="tabular-nums whitespace-nowrap">
                    {r.seatsUsed} / {r.seatsLimit}
                    {r.seatsUsed >= r.seatsLimit && <span className="text-red-600 font-bold ml-1.5">full</span>}
                  </Td>
                  <Td><Bar pct={Math.min(100, r.seatsPct)} tone={r.seatsPct >= 100 ? "red" : r.seatsPct >= 80 ? "amber" : "emerald"} /></Td>
                  <Td className="tabular-nums whitespace-nowrap">
                    {num(r.leadsUsed)} / {r.leadsLimit == null ? <span className="text-ink-faint">∞</span> : num(r.leadsLimit)}
                    {r.leadsOver && <span className="text-red-600 font-bold ml-1.5">at cap</span>}
                  </Td>
                  <Td>
                    {r.leadsLimit == null
                      ? <span className="text-[11px] text-ink-faint">unlimited</span>
                      : <Bar pct={Math.min(100, r.leadsPct)} tone={r.leadsPct >= 100 ? "red" : r.leadsPct >= 80 ? "amber" : "emerald"} />}
                  </Td>
                  <Td className="text-right tabular-nums text-ink-muted">{num(r.monthlyImported)}</Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableWrap>
        <p className="text-[10.5px] text-ink-faint mt-2">
          A seat is any user that is active <em>or</em> has an unaccepted invite. &ldquo;Imported this month&rsquo;
          counts leads created since the 1st and is informational — the enforced cap is on <em>active</em> leads held
          at once, not on monthly volume.
        </p>
      </section>
    </div>
  )
}
