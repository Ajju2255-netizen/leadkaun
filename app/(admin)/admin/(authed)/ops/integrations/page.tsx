import { getIntegrations } from "@/lib/admin/ops"
import { PageHeader, Card, Dot, Pill, ago, type Tone } from "../../_components/ui"

export const dynamic = "force-dynamic"

const STATUS: Record<string, { tone: Tone; label: string }> = {
  connected: { tone: "emerald", label: "Connected" },
  degraded: { tone: "red", label: "Degraded" },
  "not-configured": { tone: "slate", label: "Not configured" },
  unknown: { tone: "slate", label: "Unknown" },
}

export default async function IntegrationsPage() {
  const rows = await getIntegrations()
  const degraded = rows.filter((r) => r.status === "degraded")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        subtitle="Every external dependency, and whether data is actually moving through it. 'Unknown' means there was no traffic to judge — it is not the same as healthy."
        right={
          degraded.length > 0
            ? <Pill tone="red">{degraded.length} degraded</Pill>
            : <Pill tone="emerald">nothing degraded</Pill>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {rows.map((i) => {
          const s = STATUS[i.status]
          return (
            <Card key={i.key}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Dot tone={s.tone} glow />
                  <div>
                    <p className="text-[14px] font-black text-ink">{i.name}</p>
                    <p className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>{s.label}</p>
                  </div>
                </div>
                <span className="text-[11px] text-ink-muted tabular-nums shrink-0">
                  {i.lastActivityAt ? ago(i.lastActivityAt) : "no activity"}
                </span>
              </div>

              <p className="text-[12.5px] text-ink-soft mt-2.5 leading-relaxed">{i.detail}</p>

              {i.stats.length > 0 && (
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-3 pt-3 border-t border-hairline">
                  {i.stats.map((st) => (
                    <div key={st.label} className="flex justify-between gap-3">
                      <span className="text-[11.5px] text-ink-muted">{st.label}</span>
                      <span className="text-[11.5px] font-bold tabular-nums text-ink">{st.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 px-5 py-3.5">
        <p className="text-[12px] text-ink-soft leading-relaxed">
          <span className="font-bold text-ink">Not listed, because nothing exists to monitor:</span> CRM connectors
          (HubSpot / Zoho / Salesforce), outbound webhooks, and a public API. The <code>IntakeSource</code> enum
          already reserves <code>API</code>, so intake sessions from those connectors will appear here for free once
          they are built — this page reads the same tables.
        </p>
      </div>
    </div>
  )
}
