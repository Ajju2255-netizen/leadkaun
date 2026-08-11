import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { getAuditLog, getOpenImpersonations, type AuditKind } from "@/lib/admin/audit"
import { FilterBar, type SelectFilter } from "../_components/FilterBar"
import {
  PageHeader, Card, Stat, SectionLabel, Pill, EmptyState,
  TableWrap, THead, TBody, Th, Td, Tr, num, ago, dateTime, duration, type Tone,
} from "../_components/ui"

export const dynamic = "force-dynamic"

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined

const KIND_TONE: Record<AuditKind, Tone> = {
  impersonation: "red", plan: "violet", flag: "violet", billing: "emerald", lifecycle: "slate",
}

const FILTERS: SelectFilter[] = [
  {
    param: "kind", label: "All actions",
    options: [
      { value: "impersonation", label: "Impersonation" },
      { value: "plan", label: "Plan changes" },
      { value: "flag", label: "Feature flags" },
      { value: "billing", label: "Billing events" },
      { value: "lifecycle", label: "Customer lifecycle" },
    ],
  },
  {
    param: "days", label: "Last 90 days",
    options: [
      { value: "7", label: "Last 7 days" },
      { value: "30", label: "Last 30 days" },
      { value: "90", label: "Last 90 days" },
      { value: "365", label: "Last year" },
    ],
  },
]

export default async function AuditPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const kind = one(searchParams.kind) as AuditKind | undefined
  const days = Number(one(searchParams.days) ?? 90) || 90
  const accountId = one(searchParams.account)

  const [{ entries, counts }, open] = await Promise.all([
    getAuditLog({ kind, days, accountId }),
    getOpenImpersonations(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        subtitle="Every sensitive action, from the tables that already record them — impersonation_logs, account_events and feature_flags. No parallel audit table, so this can never disagree with its own sources."
        right={<span className="text-[12px] text-ink-muted tabular-nums">{num(entries.length)} entries</span>}
      />

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Impersonations" value={num(counts.impersonation)} tone={counts.impersonation > 0 ? "red" : "slate"} />
        <Stat label="Plan changes" value={num(counts.plan)} tone="violet" />
        <Stat label="Flag changes" value={num(counts.flag)} tone="violet" />
        <Stat label="Billing events" value={num(counts.billing)} tone="emerald" />
        <Stat label="Lifecycle" value={num(counts.lifecycle)} />
      </div>

      {/* ── Open impersonations ── */}
      {open.length > 0 && (
        <section>
          <SectionLabel right="sessions never explicitly exited">Open impersonation sessions</SectionLabel>
          <div className="rounded-2xl border border-orange-200 bg-orange-50/70 divide-y divide-orange-200/60 overflow-hidden">
            {open.map((o) => (
              <div key={o.id} className="px-5 py-3 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-bold text-orange-800">
                      {o.adminEmail} → {o.accountName}
                    </p>
                    <p className="text-[11.5px] text-orange-700">
                      {o.reason ?? "no reason recorded"}
                      {o.ip && <span className="font-mono"> · {o.ip}</span>}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11.5px] text-orange-800 font-semibold tabular-nums">{ago(o.startedAt)}</p>
                  {o.likelyStale && (
                    <p className="text-[10.5px] text-orange-600">
                      older than the 1h marker — likely just never exited
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10.5px] text-ink-faint mt-2">
            The impersonation marker expires after one hour regardless, so a stale row means the admin closed the tab
            rather than clicking Exit. It is a hygiene signal, not an open door.
          </p>
        </section>
      )}

      {accountId && (
        <p className="text-[12px] text-ink-soft">
          Filtered to one account.{" "}
          <Link href="/admin/audit" className="text-sky-600 font-semibold hover:text-sky-700">Show all</Link>
        </p>
      )}

      <FilterBar filters={FILTERS} showSearch={false} />

      <TableWrap>
        <table className="w-full text-left min-w-[900px]">
          <THead>
            <Th>Action</Th>
            <Th>Actor</Th>
            <Th>Account</Th>
            <Th>Detail</Th>
            <Th>IP</Th>
            <Th>When</Th>
          </THead>
          <TBody>
            {entries.length === 0 ? (
              <tr><td colSpan={6}><EmptyState>Nothing recorded for these filters.</EmptyState></td></tr>
            ) : entries.map((e) => (
              <Tr key={e.id} className={e.sensitive ? "bg-orange-50/40" : ""}>
                <Td>
                  <Pill tone={KIND_TONE[e.kind]}>{e.kind}</Pill>{" "}
                  <span className="text-[12.5px] font-semibold text-ink">{e.action}</span>
                  {e.kind === "impersonation" && (
                    <span className="text-[10.5px] text-ink-muted ml-1.5">
                      {e.endedAt ? `ended after ${duration(e.endedAt.getTime() - e.at.getTime())}` : "still open"}
                    </span>
                  )}
                </Td>
                <Td className="whitespace-nowrap">
                  {e.actor
                    ? <span className="font-semibold text-ink">{e.actor}</span>
                    : <span className="text-ink-faint">system / not recorded</span>}
                </Td>
                <Td>
                  <Link href={`/admin/accounts/${e.accountId}`} className="text-sky-600 font-semibold hover:text-sky-700">
                    {e.accountName}
                  </Link>
                </Td>
                <Td className="max-w-[320px]">
                  <span className="text-ink-soft break-words">{e.detail ?? "—"}</span>
                  {e.raw != null && (
                    <details className="mt-0.5">
                      <summary className="text-[10.5px] text-ink-muted cursor-pointer hover:text-sky-600">raw</summary>
                      <pre className="text-[10px] font-mono text-ink-muted mt-1 overflow-x-auto">{JSON.stringify(e.raw, null, 2)}</pre>
                    </details>
                  )}
                </Td>
                <Td className="font-mono text-[11px] text-ink-muted">{e.ip ?? "—"}</Td>
                <Td className="text-ink-muted whitespace-nowrap">{dateTime(e.at)}</Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableWrap>

      <Card>
        <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">What this log cannot show</p>
        <ul className="space-y-1 text-[12px] text-ink-soft">
          <li>
            <span className="font-semibold text-ink">Field-level before → after diffs.</span> The event{" "}
            <code>detail</code> JSON stores the new value only; the previous one was never captured, so a diff would
            have to be reconstructed and could be wrong.
          </li>
          <li>
            <span className="font-semibold text-ink">Which admin made a plan or flag change, as a structured field.</span>{" "}
            <code>account_events.actor_user_id</code> points at customer users and is null for platform admins — the
            admin&rsquo;s email is written into the human-readable summary instead. It is in the &ldquo;Detail&rdquo;
            column above, just not queryable.
          </li>
          <li>
            <span className="font-semibold text-ink">Reads.</span> Only writes and impersonation are recorded. Viewing
            a customer&rsquo;s leads through this panel leaves no trace.
          </li>
        </ul>
      </Card>
    </div>
  )
}
