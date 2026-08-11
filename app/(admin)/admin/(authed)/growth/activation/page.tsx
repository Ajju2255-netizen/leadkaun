import Link from "next/link"
import { getActivationFunnel, getSignupCohorts } from "@/lib/admin/growth"
import { getFeatureUsage } from "@/lib/admin/usage"
import {
  PageHeader, Card, Stat, SectionLabel, Bar, BarRow, EmptyState,
  TableWrap, THead, TBody, Th, Td, Tr, num, dateOnly,
} from "../../_components/ui"

export const dynamic = "force-dynamic"

export default async function ActivationPage() {
  const [{ rows, totalAccounts }, cohorts, usage] = await Promise.all([
    getActivationFunnel(), getSignupCohorts(12), getFeatureUsage(),
  ])

  const activated = rows.find((r) => r.label === "Activated")?.count ?? 0
  const paid = rows.find((r) => r.label === "Paid")?.count ?? 0

  return (
    <div className="space-y-7">
      <PageHeader
        title="Activation"
        subtitle="Where accounts stop. Each step is a real row in the database, and every drop-off lists the accounts that fell out at exactly that point."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Accounts" value={num(totalAccounts)} />
        <Stat label="Activated" value={num(activated)} tone="emerald" sub={totalAccounts ? `${Math.round((activated / totalAccounts) * 100)}%` : undefined} />
        <Stat label="Paid" value={num(paid)} tone="emerald" sub={totalAccounts ? `${Math.round((paid / totalAccounts) * 100)}%` : undefined} />
        <Stat label="Cohorts tracked" value={num(cohorts.length)} sub="last 12 weeks" />
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 px-5 py-3.5">
        <p className="text-[12px] text-ink-soft leading-relaxed">
          <span className="font-bold text-ink">The funnel starts at signup, not at visit.</span> There is no page-view
          or visitor tracking in this product, so a visitor→signup rate would be invented rather than measured. It is
          left out on purpose.
        </p>
      </div>

      {/* ── Funnel with drop-off drill-down ── */}
      <section>
        <SectionLabel right="all accounts, all time">Activation funnel</SectionLabel>
        <div className="space-y-3">
          {rows.map((s, i) => (
            <Card key={s.label}>
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <span className="text-[13px] font-bold text-ink">{s.label}</span>
                <span className="tabular-nums text-[12.5px]">
                  <span className="text-ink font-bold">{num(s.count)}</span>
                  <span className="text-ink-muted"> · {s.pctOfTop}%</span>
                  {s.dropPct != null && s.dropPct > 0 && (
                    <span className="text-orange-600 font-bold ml-2">−{s.dropPct}% from previous</span>
                  )}
                </span>
              </div>
              <Bar pct={s.pctOfTop} tone={i === rows.length - 1 ? "emerald" : "sky"} height="h-3" />
              <p className="text-[10.5px] text-ink-faint mt-1.5">{s.hint}</p>

              {s.stuck.length > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-hairline">
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">
                    Fell out here · showing {s.stuck.length}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.stuck.map((a) => (
                      <Link
                        key={a.id}
                        href={`/admin/accounts/${a.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg glass-1 px-2.5 py-1 text-[11.5px] font-semibold text-ink-soft hover:text-sky-600 transition-colors"
                      >
                        {a.name}
                        <span className="text-ink-faint font-normal">{dateOnly(a.createdAt)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* ── Feature adoption ── */}
      <section>
        <SectionLabel right={`share of all ${num(usage.total)} accounts`}>Feature adoption</SectionLabel>
        <Card>
          <div className="space-y-2">
            {usage.rows.map((r) => (
              <BarRow key={r.label} label={r.label} count={r.count} pct={r.pct} tone={r.pct >= 60 ? "emerald" : r.pct >= 30 ? "sky" : "amber"} />
            ))}
          </div>
          <p className="text-[10.5px] text-ink-faint mt-3 leading-snug">
            These are activity proxies, not screen views — there is no page-view tracking. &ldquo;Worked recommended
            leads&rdquo; means a lead was first contacted while ranked in its rep&rsquo;s queue; it does not mean the
            Learning page was opened.
          </p>
        </Card>
      </section>

      {/* ── Cohorts ── */}
      <section>
        <SectionLabel right="D1/D7/D30 measured from each account's own signup date">
          Signup cohorts · weekly
        </SectionLabel>
        <TableWrap>
          <table className="w-full text-left min-w-[820px]">
            <THead>
              <Th>Week of</Th>
              <Th className="text-right">Signups</Th>
              <Th className="text-right">Imported</Th>
              <Th className="text-right">D1</Th>
              <Th className="text-right">D7</Th>
              <Th className="text-right">D7 %</Th>
              <Th className="text-right">D30</Th>
              <Th className="text-right">D30 %</Th>
              <Th className="text-right">Retained</Th>
              <Th className="text-right">Paid</Th>
            </THead>
            <TBody>
              {cohorts.length === 0 ? (
                <tr><td colSpan={10}><EmptyState>No signups in the last 12 weeks.</EmptyState></td></tr>
              ) : cohorts.map((c) => (
                <Tr key={c.key}>
                  <Td className="font-semibold text-ink whitespace-nowrap">{dateOnly(new Date(c.key))}</Td>
                  <Td className="text-right tabular-nums font-bold text-ink">{num(c.size)}</Td>
                  <Td className="text-right tabular-nums">{num(c.imported)}</Td>
                  <Td className="text-right tabular-nums">{num(c.d1)}</Td>
                  <Td className="text-right tabular-nums">{num(c.d7)}</Td>
                  <Td className="text-right tabular-nums">
                    {c.d7Pct == null ? <span className="text-ink-faint">—</span> : (
                      <span className={c.d7Pct >= 40 ? "text-emerald-600 font-bold" : c.d7Pct > 0 ? "text-ink" : "text-ink-faint"}>{c.d7Pct}%</span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{num(c.d30)}</Td>
                  <Td className="text-right tabular-nums">
                    {c.d30Pct == null ? <span className="text-ink-faint">—</span> : (
                      <span className={c.d30Pct >= 50 ? "text-emerald-600 font-bold" : c.d30Pct > 0 ? "text-ink" : "text-ink-faint"}>{c.d30Pct}%</span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{num(c.retained)}</Td>
                  <Td className="text-right tabular-nums text-emerald-600 font-semibold">
                    {num(c.paid)}{c.paidPct ? <span className="text-ink-faint font-normal"> · {c.paidPct}%</span> : null}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableWrap>
        <p className="text-[10.5px] text-ink-faint mt-2 leading-snug">
          A cohort activates when it has both a completed import and a real rep action; the clock runs from signup to
          whichever came second. &ldquo;Retained&rdquo; is a real action in the last 14 days, so the newest cohorts have
          had less chance to show D30 — read the recent rows as incomplete, not as a decline.
        </p>
      </section>
    </div>
  )
}
