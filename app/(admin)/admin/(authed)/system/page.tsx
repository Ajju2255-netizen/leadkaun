import Link from "next/link"
import { getSystemHealth } from "@/lib/admin/system"
import { getEmailStats } from "@/lib/admin/emails"
import { getJobHealth } from "@/lib/admin/ops"
import {
  PageHeader, Card, Stat, SectionLabel, Dot, EmptyState,
  TableWrap, THead, TBody, Th, Td, Tr, num, ago, pctOrDash,
} from "../_components/ui"

export const metadata = { title: "System health" }

export const dynamic = "force-dynamic"

export default async function SystemPage() {
  const [h, emails, jobs] = await Promise.all([getSystemHealth(), getEmailStats(), getJobHealth()])
  const delayed = jobs.filter((j) => j.healthy === false)

  return (
    <div className="space-y-7">
      <PageHeader
        title="System health"
        subtitle="Infrastructure, email deliverability and job heartbeats. Job scheduling detail lives in Operations → Jobs; this is the at-a-glance view."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Database" value={h.dbOk ? "Healthy" : "Down"} tone={h.dbOk ? "emerald" : "red"} sub="SELECT 1" />
        <Stat label="Emails today" value={num(h.emailsToday)} sub="status = sent" />
        <Stat label="Email failures today" value={num(h.emailFailedToday)} tone={h.emailFailedToday > 0 ? "red" : "slate"} />
        <Stat label="Rate-limit keys" value={num(h.rateLimitKeys)} sub="live fixed-window rows" />
      </div>

      {/* ── Jobs at a glance ── */}
      <section>
        <SectionLabel right={<Link href="/ops/jobs" className="text-sky-600 font-semibold hover:text-sky-700">full history →</Link>}>
          Background jobs {delayed.length > 0 && <span className="text-red-600">· {delayed.length} delayed</span>}
        </SectionLabel>
        <div className="rounded-2xl border border-slate-200/70 bg-white divide-y divide-hairline overflow-hidden">
          {jobs.map((j) => (
            <div key={j.name} className="px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Dot tone={j.healthy === true ? "emerald" : j.healthy === false ? "red" : "slate"} />
                <span className="text-[12.5px] font-semibold text-ink font-mono">{j.name}</span>
                <span className="text-[10.5px] text-ink-faint">{j.schedule}</span>
              </div>
              <span className="text-[11px] text-ink-muted shrink-0 tabular-nums">
                {j.reason ? <span className="text-red-600 font-semibold">{j.reason}</span> : j.lastRunAt ? `last run ${ago(j.lastRunAt)}` : "no runs yet"}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[10.5px] text-ink-faint mt-1.5">
          Each function is judged against its own cadence — a daily job and a five-minute job cannot share one
          staleness threshold. Event-driven functions (icp-regrade) are never marked stale.
        </p>
      </section>

      {/* ── Email ── */}
      <section>
        <SectionLabel right={!emails.anyOpens ? "no opens recorded — the Resend webhook may not be wired" : undefined}>
          Email engagement
        </SectionLabel>
        {emails.templates.length === 0 ? (
          <Card><EmptyState>No emails have been sent.</EmptyState></Card>
        ) : (
          <>
            <TableWrap>
              <table className="w-full text-left min-w-[560px]">
                <THead>
                  <Th>Template</Th>
                  <Th className="text-right">Sent</Th>
                  <Th className="text-right">Opened</Th>
                  <Th className="text-right">Open %</Th>
                  <Th className="text-right">Failed</Th>
                </THead>
                <TBody>
                  {emails.templates.map((t) => (
                    <Tr key={t.template}>
                      <Td className="font-mono text-[12px] text-ink">{t.template}</Td>
                      <Td className="text-right tabular-nums">{num(t.sent)}</Td>
                      <Td className="text-right tabular-nums">{num(t.opened)}</Td>
                      <Td className="text-right tabular-nums">
                        {t.openPct == null ? <span className="text-ink-faint">—</span> : <span className="text-emerald-600 font-semibold">{t.openPct}%</span>}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {t.failed > 0 ? <span className="text-red-600 font-bold">{t.failed}</span> : <span className="text-ink-faint">0</span>}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </table>
            </TableWrap>
            <p className="text-[10.5px] text-ink-faint mt-1.5">
              {num(emails.totalSent)} sent · {num(emails.totalOpened)} opened overall
              {" · "}open rate {pctOrDash(emails.totalSent > 0 ? Math.round((emails.totalOpened / emails.totalSent) * 100) : null)}.
              Opens depend on the Resend webhook hitting <code>/api/webhooks/resend</code>; without it every open
              reads as zero, which is a wiring problem rather than a deliverability one.
            </p>
          </>
        )}
      </section>

      <section>
        <SectionLabel right={<Link href="/ops/errors" className="text-sky-600 font-semibold hover:text-sky-700">error centre →</Link>}>
          Where to look next
        </SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link href="/ops/errors" className="block lift">
            <Card><p className="text-[13px] font-bold text-ink">Errors</p><p className="text-[11.5px] text-ink-muted mt-0.5">System failures separated from expected validation skips.</p></Card>
          </Link>
          <Link href="/ops/integrations" className="block lift">
            <Card><p className="text-[13px] font-bold text-ink">Integrations</p><p className="text-[11.5px] text-ink-muted mt-0.5">Sheets, Resend, Razorpay, Inngest, Supabase.</p></Card>
          </Link>
          <Link href="/ops/jobs" className="block lift">
            <Card><p className="text-[13px] font-bold text-ink">Jobs</p><p className="text-[11.5px] text-ink-muted mt-0.5">Run history, durations and failures per function.</p></Card>
          </Link>
        </div>
      </section>

      <Card>
        <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">API metrics are not shown</p>
        <p className="text-[12px] text-ink-soft leading-relaxed">
          Request counts, latency percentiles and per-endpoint error rates would need a request log, and nothing in
          this codebase writes one — routes self-guard and return, leaving no row behind. The only API-adjacent
          signal that <em>is</em> persisted is <code>rate_limits</code> ({num(h.rateLimitKeys)} live keys above),
          which counts pressure per limiter key, not traffic. Vercel&rsquo;s own observability is the honest source
          for latency and 5xx rates today.
        </p>
      </Card>
    </div>
  )
}
