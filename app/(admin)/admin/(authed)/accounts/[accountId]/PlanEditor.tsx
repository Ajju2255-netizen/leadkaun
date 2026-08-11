"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type Plan = { key: string; name: string; priceRupees: number }
const STATUSES = ["trialing", "active", "past_due", "canceled"]

export function PlanEditor({
  accountId, plans, current, canWrite = true,
}: {
  accountId: string
  plans: Plan[]
  current: { planKey: string; status: string; mrrRupees: number } | null
  canWrite?: boolean
}) {
  const router = useRouter()
  const [planKey, setPlanKey] = useState(current?.planKey ?? plans[0]?.key ?? "")
  const [status, setStatus] = useState(current?.status ?? "trialing")
  const [mrr, setMrr] = useState(String(current?.mrrRupees ?? 0))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function onPlan(k: string) {
    setPlanKey(k)
    const p = plans.find((x) => x.key === k)
    if (p) setMrr(String(p.priceRupees))
  }

  async function save() {
    setBusy(true); setSaved(false); setErr(null)
    const res = await fetch("/api/admin/platform/subscription", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, planKey, status, mrrRupees: Number(mrr) || 0 }),
    }).catch(() => null)
    setBusy(false)
    if (res && res.ok) { setSaved(true); router.refresh() }
    else setErr(res ? `Save failed (${res.status})` : "Network error")
  }

  const sel =
    "h-9 w-full rounded-lg bg-white/80 border border-hairline-strong px-2.5 text-[13px] text-ink outline-none focus:border-sky-400 disabled:opacity-50"

  return (
    <div className="rounded-2xl glass-2 px-5 py-4 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block mb-1">Plan</label>
          <select value={planKey} onChange={(e) => onPlan(e.target.value)} disabled={!canWrite} className={sel}>
            {plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block mb-1">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={!canWrite} className={sel}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block mb-1">MRR ₹/mo</label>
          <input
            value={mrr}
            onChange={(e) => setMrr(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric" disabled={!canWrite} className={`${sel} tabular-nums`}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy || !canWrite}
          title={canWrite ? undefined : "Requires the SUPER_ADMIN role"}
          className="btn-primary h-9 px-4 text-[13px] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Saving…" : "Save plan"}
        </button>
        {saved && <span className="text-[12px] text-emerald-600 font-semibold">Saved · audited</span>}
        {err && <span className="text-[12px] text-red-600">{err}</span>}
      </div>
    </div>
  )
}
