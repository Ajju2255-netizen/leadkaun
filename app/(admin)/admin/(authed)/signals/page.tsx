import Link from "next/link"
import { getSignalExplorer, allSignalTypes, type SignalFilters } from "@/lib/admin/signals"
import { getScopeOptions } from "@/lib/admin/scoring"
import { FilterBar, type SelectFilter } from "../_components/FilterBar"
import {
  PageHeader, Card, Stat, SectionLabel, BarRow, Grade, EmptyState,
  TableWrap, THead, TBody, Th, Td, Tr, num, dateTime,
} from "../_components/ui"
import type { SignalType } from "@prisma/client"

export const dynamic = "force-dynamic"

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined

export default async function SignalsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const f: SignalFilters = {
    type: one(searchParams.type) as SignalType | undefined,
    accountId: one(searchParams.account),
    leadId: one(searchParams.lead),
    days: Number(one(searchParams.days) ?? 30) || 30,
    clamped: one(searchParams.clamped) === "1",
  }
  const [x, scope] = await Promise.all([getSignalExplorer(f), getScopeOptions()])

  const filters: SelectFilter[] = [
    { param: "type", label: "All signal types", options: allSignalTypes() },
    { param: "account", label: "All accounts", options: scope.accounts.map((a) => ({ value: a.id, label: a.name })) },
    {
      param: "days", label: "Last 30 days",
      options: [
        { value: "1", label: "Last 24 hours" },
        { value: "7", label: "Last 7 days" },
        { value: "30", label: "Last 30 days" },
        { value: "90", label: "Last 90 days" },
      ],
    },
    { param: "clamped", label: "All signals", options: [{ value: "1", label: "Clamped only" }] },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Signals"
        subtitle="Every piece of engagement evidence the engine has recorded. Intent is the running sum of these minus decay, clamped to [source baseline, 100] — so each row carries the intent before and after it landed."
        right={<span className="text-[12px] text-ink-muted tabular-nums">{num(x.total)} in {x.windowDays}d</span>}
      />

      {f.leadId && (
        <p className="text-[12px] text-ink-soft">
          Filtered to a single lead.{" "}
          <Link href={`/admin/leads/${f.leadId}`} className="text-sky-600 font-semibold hover:text-sky-700">Open the inspector</Link>
          {" · "}
          <Link href="/admin/signals" className="text-sky-600 font-semibold hover:text-sky-700">show all</Link>
        </p>
      )}

      <FilterBar filters={filters} showSearch={false} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Signals in window" value={num(x.total)} />
        <Stat label="Distinct types seen" value={num(x.types.length)} />
        <Stat label="Shown below" value={`${num(x.rows.length)}${x.truncated ? "+" : ""}`} />
        <Stat
          label="Value ≠ configured weight" value={num(x.offWeight)}
          tone={x.offWeight > 0 ? "amber" : "slate"} sub="of the rows shown"
        />
      </div>

      {/* ── Type mix ── */}
      <section>
        <SectionLabel right="configured weight in brackets">Signal mix</SectionLabel>
        <Card>
          {x.types.length === 0 ? <p className="text-[13px] text-ink-muted">No signals in this window.</p> : (
            <div className="space-y-2">
              {x.types.slice(0, 18).map((t) => (
                <BarRow
                  key={t.type}
                  label={
                    <span className="font-mono text-[11.5px]">
                      {t.type}
                      <span className="text-ink-faint ml-1.5">
                        [{t.configuredWeight ?? "—"}]
                        {t.configuredWeight != null && Math.round(t.avgValue) !== t.configuredWeight && (
                          <span className="text-orange-500"> avg {t.avgValue}</span>
                        )}
                      </span>
                    </span>
                  }
                  count={t.count}
                  pct={t.pct}
                  tone={t.configuredWeight != null && t.configuredWeight < 0 ? "red" : "sky"}
                />
              ))}
            </div>
          )}
          <p className="text-[10.5px] text-ink-faint mt-3 leading-snug">
            An average that differs from the configured weight is normal for <code>INTENT_DECAY</code> (a computed
            per-day delta) and <code>SOURCE_BASELINE</code> (carries the source&rsquo;s own baseline). For a fixed-weight
            type it means something wrote a value the weight map doesn&rsquo;t define.
          </p>
        </Card>
      </section>

      {/* ── Rows ── */}
      <section>
        <SectionLabel right="newest first">Signal log</SectionLabel>
        <TableWrap>
          <table className="w-full text-left min-w-[980px]">
            <THead>
              <Th>Signal</Th>
              <Th className="text-right">Value</Th>
              <Th className="text-right">Weight</Th>
              <Th className="text-right">Before</Th>
              <Th className="text-right">After</Th>
              <Th className="text-right">Applied</Th>
              <Th>Grade then</Th>
              <Th>Lead</Th>
              <Th>Account</Th>
              <Th>By</Th>
              <Th>When</Th>
            </THead>
            <TBody>
              {x.rows.length === 0 ? (
                <tr><td colSpan={11}><EmptyState>No signals match these filters.</EmptyState></td></tr>
              ) : x.rows.map((s) => {
                const clamped = s.applied !== s.value
                const offWeight = s.configuredWeight != null && s.value !== s.configuredWeight
                return (
                  <Tr key={s.id}>
                    <Td className="font-mono text-[11.5px] text-ink">{s.type}</Td>
                    <Td className={`text-right tabular-nums font-bold ${s.value > 0 ? "text-emerald-600" : s.value < 0 ? "text-red-600" : "text-ink-muted"}`}>
                      {s.value > 0 ? `+${s.value}` : s.value}
                    </Td>
                    <Td className={`text-right tabular-nums ${offWeight ? "text-orange-600 font-semibold" : "text-ink-faint"}`}>
                      {s.configuredWeight ?? "—"}
                    </Td>
                    <Td className="text-right tabular-nums text-ink-muted">{s.before}</Td>
                    <Td className="text-right tabular-nums font-semibold text-ink">{s.after}</Td>
                    <Td className={`text-right tabular-nums ${clamped ? "text-orange-600 font-semibold" : ""}`}>
                      {s.applied > 0 ? `+${s.applied}` : s.applied}
                    </Td>
                    <Td><Grade grade={s.gradeAt} /></Td>
                    <Td>
                      <Link href={`/admin/leads/${s.leadId}`} className="font-semibold text-ink hover:text-sky-600">
                        {s.leadName || "(no name)"}
                      </Link>
                    </Td>
                    <Td>
                      <Link href={`/admin/accounts/${s.accountId}`} className="text-sky-600 font-semibold hover:text-sky-700">
                        {s.accountName}
                      </Link>
                    </Td>
                    <Td className="text-ink-muted">{s.actor ?? <span className="text-ink-faint">system</span>}</Td>
                    <Td className="text-ink-muted whitespace-nowrap">{dateTime(s.at)}</Td>
                  </Tr>
                )
              })}
            </TBody>
          </table>
        </TableWrap>
        <p className="text-[10.5px] text-ink-faint mt-1.5">
          <span className="font-semibold">Applied</span> is after − before, which is what actually moved intent.
          It differs from <span className="font-semibold">Value</span> when the clamp to [source baseline, 100]
          absorbed part of the signal — expected behaviour, and the reason a −30 WRONG_NUMBER can look like it did
          nothing on a lead already at its floor.
        </p>
      </section>
    </div>
  )
}
