import Link from "next/link"
import { getJobHealth, listJobRuns, JOB_SPECS } from "@/lib/admin/ops"
import { FilterBar, type SelectFilter } from "../../_components/FilterBar"
import {
  PageHeader, Card, SectionLabel, Dot, Pill, EmptyState,
  TableWrap, THead, TBody, Th, Td, Tr, num, ago, dateTime, duration,
} from "../../_components/ui"

export const metadata = { title: "Jobs" }

export const dynamic = "force-dynamic"

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined

export default async function JobsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const fn = one(searchParams.fn)
  const status = one(searchParams.status)
  const [health, runs] = await Promise.all([getJobHealth(), listJobRuns({ fn, status, take: 120 })])

  const delayed = health.filter((j) => j.healthy === false)
  const filters: SelectFilter[] = [
    { param: "fn", label: "All functions", options: JOB_SPECS.map((s) => ({ value: s.name, label: s.label })) },
    {
      param: "status", label: "All statuses",
      options: [
        { value: "success", label: "Success" },
        { value: "failed", label: "Failed" },
        { value: "running", label: "Running" },
      ],
    },
  ]

  return (
    <div className="space-y-7">
      <PageHeader
        title="Background jobs"
        subtitle="Every scheduled function, judged against its own cadence. A daily job silent for 20 hours is fine; a five-minute job silent for 20 hours is not — one flat staleness threshold cannot tell those apart, so this doesn't use one."
        right={
          delayed.length > 0
            ? <Pill tone="red">{delayed.length} delayed or failing</Pill>
            : <Pill tone="emerald">all on schedule</Pill>
        }
      />

      <section>
        <SectionLabel right="heartbeat written once per run, inside a memoized Inngest step">Health</SectionLabel>
        <div className="rounded-2xl border border-slate-200/70 bg-white divide-y divide-hairline overflow-hidden">
          {health.map((j) => (
            <div key={j.name} className="px-4 py-3 flex items-center gap-3">
              <Dot tone={j.healthy === true ? "emerald" : j.healthy === false ? "red" : "slate"} glow />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-ink">
                  {j.label} <span className="font-mono font-normal text-[11px] text-ink-muted">{j.name}</span>
                </p>
                <p className="text-[11px] text-ink-muted">
                  {j.schedule}{j.note && ` · ${j.note}`}
                  {/* Red only for an actual fault. "Never run" is unknown, not broken —
                      it matches the grey dot rather than shouting in red. */}
                  {j.reason && (
                    <span className={j.healthy === false ? "text-red-600 font-semibold" : "text-ink-faint"}>
                      {" · "}{j.reason}
                    </span>
                  )}
                </p>
                {j.lastError && <p className="text-[11px] text-red-600 font-mono mt-0.5 truncate">{j.lastError}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="text-[12px] text-ink-soft tabular-nums">
                  {j.lastRunAt ? ago(j.lastRunAt) : <span className="text-ink-faint">never run</span>}
                </p>
                <p className="text-[10.5px] text-ink-faint tabular-nums">
                  {j.runs24h} run{j.runs24h === 1 ? "" : "s"} / 24h
                  {j.failures24h > 0 && <span className="text-red-600 font-semibold"> · {j.failures24h} failed</span>}
                  {j.lastDurationMs != null && ` · last ${duration(j.lastDurationMs)}`}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10.5px] text-ink-faint mt-2">
          There is no retry control here on purpose: an Inngest function is retried by Inngest, and a re-run button
          that isn&rsquo;t idempotent would be more dangerous than useful. Re-run from the Inngest dashboard.
        </p>
      </section>

      <section>
        <SectionLabel right={`${num(runs.length)} most recent runs`}>Run history</SectionLabel>
        <FilterBar filters={filters} showSearch={false} />
        <div className="mt-3">
          <TableWrap>
            <table className="w-full text-left min-w-[760px]">
              <THead>
                <Th>Function</Th>
                <Th>Status</Th>
                <Th className="text-right">Items</Th>
                <Th className="text-right">Duration</Th>
                <Th>Account</Th>
                <Th>Error</Th>
                <Th>Started</Th>
              </THead>
              <TBody>
                {runs.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState>No job runs recorded for these filters.</EmptyState></td></tr>
                ) : runs.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-mono text-[11.5px] text-ink">{r.function}</Td>
                    <Td>
                      <Pill tone={r.status === "success" ? "emerald" : r.status === "failed" ? "red" : "sky"}>{r.status}</Pill>
                    </Td>
                    <Td className="text-right tabular-nums">{r.items > 0 ? num(r.items) : <span className="text-ink-faint">—</span>}</Td>
                    <Td className="text-right tabular-nums text-ink-muted">{duration(r.durationMs)}</Td>
                    <Td>
                      {r.accountId
                        ? <Link href={`/accounts/${r.accountId}`} className="text-sky-600 font-semibold hover:text-sky-700">view</Link>
                        : <span className="text-ink-faint">all</span>}
                    </Td>
                    <Td className="max-w-[240px]">
                      {r.error ? <span className="text-red-600 font-mono text-[11px] break-words">{r.error}</span> : <span className="text-ink-faint">—</span>}
                    </Td>
                    <Td className="text-ink-muted whitespace-nowrap">{dateTime(r.startedAt)}</Td>
                  </Tr>
                ))}
              </TBody>
            </table>
          </TableWrap>
        </div>
      </section>

      <Card>
        <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-2">Schedules</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-[11.5px]">
          {JOB_SPECS.map((s) => (
            <div key={s.name} className="flex justify-between gap-3">
              <span className="text-ink-soft font-mono">{s.name}</span>
              <span className="text-ink-muted">{s.schedule}</span>
            </div>
          ))}
        </div>
        <p className="text-[10.5px] text-ink-faint mt-2">
          Crons are configured in UTC; the times above are IST (UTC+5:30). Source of truth is{" "}
          <code>inngest/functions/*.ts</code>.
        </p>
      </Card>
    </div>
  )
}
