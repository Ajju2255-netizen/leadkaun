import Link from "next/link"
import { getErrorCenter, SKIP_REASON_LABELS } from "@/lib/admin/ops"
import { FilterBar, type SelectFilter } from "../../_components/FilterBar"
import {
  PageHeader, Card, Stat, SectionLabel, BarRow, Pill,
  num, dateTime, pctOrDash,
} from "../../_components/ui"

export const dynamic = "force-dynamic"

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined

const WINDOW: SelectFilter[] = [
  {
    param: "days", label: "Last 7 days",
    options: [
      { value: "1", label: "Last 24 hours" },
      { value: "7", label: "Last 7 days" },
      { value: "30", label: "Last 30 days" },
    ],
  },
]

const KIND_TONE = { import: "amber", email: "red", "sheet-sync": "amber", job: "red" } as const

function ErrorList({ rows, empty }: { rows: Awaited<ReturnType<typeof getErrorCenter>>["systemFailures"]; empty: string }) {
  if (rows.length === 0) return <Card><p className="text-[13px] text-emerald-700 font-semibold">{empty}</p></Card>
  return (
    <div className="rounded-2xl glass-2 divide-y divide-hairline overflow-hidden">
      {rows.map((e) => (
        <div key={`${e.kind}-${e.id}`} className="px-4 py-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12.5px] text-ink">
              <Pill tone={KIND_TONE[e.kind]}>{e.kind}</Pill>{" "}
              <span className="font-semibold">{e.summary}</span>
            </p>
            {e.detail && <p className="text-[11px] text-ink-muted font-mono mt-0.5 break-words">{e.detail}</p>}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {e.accountId && (
              <Link href={`/admin/accounts/${e.accountId}`} className="text-[11px] font-semibold text-sky-600 hover:text-sky-700">
                account
              </Link>
            )}
            <span className="text-[11px] text-ink-muted tabular-nums whitespace-nowrap">{dateTime(e.at)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export default async function ErrorsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const days = Number(one(searchParams.days) ?? 7) || 7
  const e = await getErrorCenter(days)

  return (
    <div className="space-y-7">
      <PageHeader
        title="Errors"
        subtitle="A row skipped because the customer's CSV had no phone number is the product working. A failed job is the product broken. Mixing the two makes every import look like an outage — so they are separated here."
        right={
          e.systemFailures.length > 0
            ? <Pill tone="red">{e.systemFailures.length} system failures</Pill>
            : <Pill tone="emerald">no system failures</Pill>
        }
      />

      <FilterBar filters={WINDOW} showSearch={false} />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Import jobs" value={num(e.imports.jobs)} />
        <Stat label="Rows processed" value={num(e.imports.totalRows)} />
        <Stat label="Insert rate" value={pctOrDash(e.imports.insertRatePct)} tone="emerald" sub={`${num(e.imports.inserted)} inserted`} />
        <Stat label="Row skip rate" value={pctOrDash(e.imports.skipRatePct)} tone={(e.imports.skipRatePct ?? 0) > 20 ? "amber" : "slate"} sub={`${num(e.imports.rowErrors)} skipped`} />
        <Stat label="Duplicates" value={num(e.imports.duplicates)} sub="deduped by phone" />
        <Stat label="Jobs FAILED" value={num(e.imports.failedJobs)} tone={e.imports.failedJobs > 0 ? "red" : "slate"} />
      </div>

      {/* ── System failures ── */}
      <section>
        <SectionLabel right="the product broke — investigate these">System failures</SectionLabel>
        <ErrorList rows={e.systemFailures} empty={`No system failures in the last ${days} days. Nothing crashed, no email bounced, no job failed, no sheet sync broke.`} />
        <p className="text-[10.5px] text-ink-faint mt-2">
          Includes: import jobs with status FAILED, failed email sends, erroring Google Sheets connections, and
          failed background-job runs. Also any import whose row errors classified as a database or internal error.
        </p>
      </section>

      {/* ── Expected skips ── */}
      <section>
        <SectionLabel right="the product worked — the data was imperfect">Expected validation skips</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2.5">Why rows were skipped</p>
            {e.skipReasons.length === 0 ? (
              <p className="text-[13px] text-ink-muted">No row-level skips recorded in this window.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {e.skipReasons.map((r) => (
                    <BarRow
                      key={r.reason}
                      label={SKIP_REASON_LABELS[r.reason] ?? r.reason}
                      count={r.count}
                      pct={r.pct}
                      tone={["DATABASE_ERROR", "INTERNAL_ERROR", "SHEET_NOT_ACCESSIBLE"].includes(r.reason) ? "red" : "amber"}
                    />
                  ))}
                </div>
                <p className="text-[10.5px] text-ink-faint mt-3 leading-snug">
                  Classified from the error strings each import job stores (up to 100 per job), since the import path
                  writes free text rather than a reason enum. Anything unmatched is counted as &ldquo;Other&rdquo;
                  rather than dropped. Red rows are misclassified skips — they are real failures.
                </p>
              </>
            )}
          </Card>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2.5">Imports with skipped rows</p>
            {e.expectedSkips.length === 0 ? (
              <Card><p className="text-[13px] text-ink-muted">Every import in this window took all its rows.</p></Card>
            ) : (
              <div className="rounded-2xl glass-2 divide-y divide-hairline overflow-hidden max-h-[420px] overflow-y-auto">
                {e.expectedSkips.map((s) => (
                  <div key={s.id} className="px-4 py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12.5px] text-ink font-semibold">{s.summary}</p>
                      {s.detail && <p className="text-[11px] text-ink-muted font-mono mt-0.5 break-words">{s.detail}</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {s.accountId && (
                        <Link href={`/admin/accounts/${s.accountId}`} className="text-[11px] font-semibold text-sky-600 hover:text-sky-700">account</Link>
                      )}
                      <span className="text-[11px] text-ink-muted tabular-nums whitespace-nowrap">{dateTime(s.at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Email failures" value={num(e.emailFailures)} tone={e.emailFailures > 0 ? "red" : "slate"} />
        <Stat label="Sheet sync failures" value={num(e.sheetFailures)} tone={e.sheetFailures > 0 ? "amber" : "slate"} />
        <Stat label="Job failures" value={num(e.jobFailures)} tone={e.jobFailures > 0 ? "red" : "slate"} />
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 px-5 py-3.5">
        <p className="text-[12px] text-ink-soft leading-relaxed">
          <span className="font-bold text-ink">Application exceptions are not listed here.</span> There is no error
          table and no APM in this codebase — a 500 from a route handler is logged to the platform console and never
          reaches the database. Everything above is drawn from rows that exist:{" "}
          <code>import_job_status</code>, <code>email_logs</code>, <code>sheet_syncs</code> and <code>job_runs</code>.
          Vercel&rsquo;s runtime logs remain the place to look for uncaught errors.
        </p>
      </div>
    </div>
  )
}
