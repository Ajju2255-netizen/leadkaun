import Link from "next/link"
import { listIntakeSessions, getIntakeSummary, STATE_LABELS, ABANDON_LABELS, type IntakeFilters } from "@/lib/admin/intake"
import { getScopeOptions } from "@/lib/admin/scoring"
import { FilterBar, type SelectFilter } from "../_components/FilterBar"
import {
  PageHeader, Stat, Pill, EmptyState, TableWrap, THead, TBody, Th, Td, Tr,
  num, ago, duration, pctOrDash, type Tone,
} from "../_components/ui"
import { IntakeSource, IntakeState } from "@prisma/client"

export const dynamic = "force-dynamic"

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined

// Not exported — Next.js only allows a fixed set of exports from a page file.
const STATE_TONE: Record<IntakeState, Tone> = {
  CREATED: "slate",
  ANALYSING: "sky",
  REPORT_READY: "sky",
  VIEWED: "sky",
  APPROVED: "emerald",
  IMPORTING: "sky",
  COMPLETED: "emerald",
  ABANDONED: "amber",
  CANCELLED: "amber",
  FAILED: "red",
}

export default async function IntakePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const f: IntakeFilters = {
    source: one(searchParams.source) as IntakeSource | undefined,
    state: one(searchParams.state) as IntakeState | undefined,
    accountId: one(searchParams.account),
    lowConfidence: one(searchParams.confidence) === "low",
    dropped: one(searchParams.outcome) === "dropped",
    days: one(searchParams.days) ? Number(one(searchParams.days)) : undefined,
  }
  const [rows, summary, scope] = await Promise.all([listIntakeSessions(f), getIntakeSummary(30), getScopeOptions()])

  const filters: SelectFilter[] = [
    { param: "account", label: "All accounts", options: scope.accounts.map((a) => ({ value: a.id, label: a.name })) },
    {
      param: "source", label: "All sources",
      options: Object.values(IntakeSource).map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
    },
    {
      param: "state", label: "All states",
      options: Object.values(IntakeState).map((s) => ({ value: s, label: STATE_LABELS[s] })),
    },
    { param: "outcome", label: "Any outcome", options: [{ value: "dropped", label: "Abandoned / cancelled" }] },
    { param: "confidence", label: "Any confidence", options: [{ value: "low", label: "Low intelligence score (<60)" }] },
    {
      param: "days", label: "All time",
      options: [
        { value: "1", label: "Last 24 hours" },
        { value: "7", label: "Last 7 days" },
        { value: "30", label: "Last 30 days" },
      ],
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Intake sessions"
        subtitle="Every dataset that has entered Leadkaun, through any connector. A session records structural metadata and the frozen report the customer saw — never their rows."
        right={
          <Link href="/admin/intake/analytics" className="text-[12px] font-semibold text-sky-600 hover:text-sky-700">
            Intake analytics →
          </Link>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Today" value={num(summary.sessionsToday)} />
        <Stat label="Last 30 days" value={num(summary.sessionsWindow)} />
        <Stat label="Approval rate" value={pctOrDash(summary.approvalRatePct)} tone="emerald" sub="approved / viewed" />
        <Stat label="Median TTT" value={duration(summary.medianTttMs)} tone="sky" sub="upload → approved" />
        <Stat label="Failed" value={num(summary.failedWindow)} tone={summary.failedWindow > 0 ? "red" : "slate"} />
        <Stat label="Stalled" value={num(summary.stalled)} tone={summary.stalled > 0 ? "amber" : "slate"} sub="mid-machine >2h" />
      </div>

      <FilterBar filters={filters} showSearch={false} />

      <TableWrap>
        <table className="w-full text-left min-w-[1000px]">
          <THead>
            <Th>Session</Th>
            <Th>Account</Th>
            <Th>Source</Th>
            <Th className="text-right">Rows</Th>
            <Th className="text-right">Cols</Th>
            <Th className="text-right">Score</Th>
            <Th>State</Th>
            <Th className="text-right">TTT</Th>
            <Th>Engine</Th>
            <Th>When</Th>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <tr><td colSpan={10}><EmptyState>No intake sessions match these filters.</EmptyState></td></tr>
            ) : rows.map((s) => (
              <Tr key={s.id}>
                <Td>
                  <Link href={`/admin/intake/${s.id}`} className="block group">
                    <p className="text-[12.5px] font-bold text-ink group-hover:text-sky-600 transition-colors font-mono">
                      {s.id.slice(-8)}
                    </p>
                    <p className="text-[11px] text-ink-muted">
                      {s.userName ?? "unknown user"}{s.workspaceName && ` · ${s.workspaceName}`}
                    </p>
                  </Link>
                </Td>
                <Td>
                  <Link href={`/admin/accounts/${s.accountId}`} className="text-sky-600 font-semibold hover:text-sky-700">
                    {s.accountName}
                  </Link>
                </Td>
                <Td className="text-ink-muted">{s.source.replace(/_/g, " ").toLowerCase()}</Td>
                <Td className="text-right tabular-nums font-semibold text-ink">{num(s.rows)}</Td>
                <Td className="text-right tabular-nums">{s.columns}</Td>
                <Td className="text-right tabular-nums">
                  {s.score == null ? <span className="text-ink-faint">—</span> : (
                    <span className={s.score >= 75 ? "text-emerald-600 font-bold" : s.score >= 60 ? "text-ink" : "text-orange-600 font-bold"}>
                      {s.score}
                    </span>
                  )}
                </Td>
                <Td>
                  <Pill tone={STATE_TONE[s.state]}>{STATE_LABELS[s.state]}</Pill>
                  {s.abandonReason && (
                    <span className="text-[10.5px] text-ink-muted ml-1.5">{ABANDON_LABELS[s.abandonReason]}</span>
                  )}
                </Td>
                <Td className="text-right tabular-nums text-ink-muted">{duration(s.tttMs)}</Td>
                <Td className="text-[11px] font-mono text-ink-faint">{s.engineVersion}</Td>
                <Td className="text-ink-muted whitespace-nowrap">{ago(s.createdAt)}</Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableWrap>

      <p className="text-[10.5px] text-ink-faint">
        Score is the internal Import Intelligence Score (0–100) — never shown to the customer as a number; they see a
        High/Medium/Low readiness word instead. Capped at 200 rows; narrow the filters to go deeper.
      </p>
    </div>
  )
}
