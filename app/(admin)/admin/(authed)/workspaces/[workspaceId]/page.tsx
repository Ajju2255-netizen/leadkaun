import { notFound } from "next/navigation"
import Link from "next/link"
import { getWorkspaceDetail } from "@/lib/admin/workspaces"
import {
  Card, Stat, SectionLabel, Bar, BarRow, Grade, Pill, EmptyState,
  num, ago, dateOnly, BackLink,
} from "../../_components/ui"

export const metadata = { title: "Workspace" }

export const dynamic = "force-dynamic"

export default async function WorkspaceDetailPage({ params }: { params: { workspaceId: string } }) {
  const d = await getWorkspaceDetail(params.workspaceId)
  if (!d) notFound()
  const w = d.row
  const totalStageLeads = d.stages.reduce((s, x) => s + x.count, 0)

  return (
    <div className="space-y-8">
      <BackLink href="/workspaces">Workspaces</BackLink>

      <div>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">
          {w.name} {w.isDefault && <Pill tone="sky">default</Pill>} {w.archivedAt && <Pill tone="amber">archived</Pill>}
        </h1>
        <p className="text-[12.5px] text-ink-soft mt-1.5">
          <Link href={`/accounts/${w.accountId}`} className="text-sky-600 font-semibold hover:text-sky-700">{w.accountName}</Link>
          {" · "}<span className="font-mono text-ink-muted">{w.slug}</span>
          {" · created "}{dateOnly(w.createdAt)}
          {" · last activity "}{ago(w.lastActiveAt)}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Active leads" value={num(w.activeLeads)} tone="sky" />
        <Stat label="Total leads" value={num(w.leads)} />
        <Stat label="Won" value={num(w.won)} tone="emerald" />
        <Stat label="Members" value={num(w.members)} />
        <Stat label="Intake sessions" value={num(w.intakeSessions)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <SectionLabel>Grade distribution</SectionLabel>
          <Card>
            {d.gradeDistribution.every((g) => g.count === 0) ? (
              <p className="text-[13px] text-ink-muted">No leads yet.</p>
            ) : (
              <div className="space-y-1.5">
                {d.gradeDistribution.map((g) => (
                  <div key={g.grade} className="flex items-center gap-2.5">
                    <Grade grade={g.grade} />
                    <div className="flex-1"><Bar pct={g.pct} tone={g.grade === "A" ? "emerald" : g.grade === "B" ? "sky" : g.grade === "F" ? "slate" : "amber"} /></div>
                    <span className="text-[11.5px] tabular-nums text-ink-soft w-24 text-right">{num(g.count)} · {g.pct}%</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>

        <section>
          <SectionLabel right="leads currently in each stage">Pipeline</SectionLabel>
          <Card>
            {d.stages.length === 0 ? <p className="text-[13px] text-ink-muted">No stages.</p> : (
              <div className="space-y-2">
                {d.stages.map((s) => (
                  <BarRow
                    key={s.name}
                    label={<span>{s.name}{s.isTerminal && <span className="text-ink-faint"> · terminal</span>}</span>}
                    count={s.count}
                    pct={totalStageLeads > 0 ? Math.round((s.count / totalStageLeads) * 100) : 0}
                    tone={s.isTerminal ? "emerald" : "sky"}
                  />
                ))}
              </div>
            )}
          </Card>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <SectionLabel right="intent baseline seeds the lead's starting intent">Lead sources in use</SectionLabel>
          <div className="rounded-2xl border border-slate-200/70 bg-white divide-y divide-hairline overflow-hidden">
            {d.sources.length === 0 ? <EmptyState>No leads have a source with volume yet.</EmptyState> : d.sources.map((s) => (
              <div key={s.name} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-ink">{s.name}</p>
                  <p className="text-[10.5px] text-ink-muted">
                    intent baseline {s.intentBaseline} · reliability {Math.round(s.reliability)}
                  </p>
                </div>
                <span className="text-[12px] tabular-nums text-ink-soft shrink-0">{num(s.count)} leads</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionLabel>Members · {d.members.length}</SectionLabel>
          <div className="rounded-2xl border border-slate-200/70 bg-white divide-y divide-hairline overflow-hidden">
            {d.members.length === 0 ? (
              <EmptyState>No membership rows — account ADMINs still see this workspace.</EmptyState>
            ) : d.members.map((m) => (
              <div key={m.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-ink truncate">{m.name}</p>
                  <p className="text-[10.5px] text-ink-muted truncate">{m.email}</p>
                </div>
                <span className="flex items-center gap-1.5 shrink-0">
                  <Pill tone={m.role === "ADMIN" ? "sky" : m.role === "MANAGER" ? "violet" : "slate"}>{m.role}</Pill>
                  {!m.isActive && <Pill tone="amber">inactive</Pill>}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
