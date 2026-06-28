"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type Plan = { key: string; name: string; priceRupees: number }
const STATUSES = ["trialing", "active", "past_due", "canceled"]

export function PlanEditor({ accountId, plans, current }: {
  accountId: string
  plans: Plan[]
  current: { planKey: string; status: string; mrrRupees: number } | null
}) {
  const router = useRouter()
  const [planKey, setPlanKey] = useState(current?.planKey ?? plans[0]?.key ?? "")
  const [status, setStatus] = useState(current?.status ?? "trialing")
  const [mrr, setMrr] = useState(String(current?.mrrRupees ?? 0))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  function onPlan(k: string) {
    setPlanKey(k)
    const p = plans.find((x) => x.key === k)
    if (p) setMrr(String(p.priceRupees))
  }

  async function save() {
    setBusy(true); setSaved(false)
    const res = await fetch("/api/admin/platform/subscription", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, planKey, status, mrrRupees: Number(mrr) || 0 }),
    }).catch(() => null)
    setBusy(false)
    if (res && res.ok) { setSaved(true); router.refresh() }
  }

  const sel = "h-9 rounded-lg bg-slate-800 border border-white/10 px-2.5 text-[13px] text-white outline-none focus:border-violet-400"

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/40 px-5 py-4 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">Plan</label>
          <select value={planKey} onChange={(e) => onPlan(e.target.value)} className={`${sel} w-full`}>
            {plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${sel} w-full`}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">MRR ₹/mo</label>
          <input value={mrr} onChange={(e) => setMrr(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" className={`${sel} w-full`} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="h-9 rounded-lg bg-gradient-to-b from-violet-500 to-fuchsia-600 hover:from-violet-400 hover:to-fuchsia-500 px-4 text-[13px] font-semibold text-white disabled:opacity-50">
          {busy ? "Saving…" : "Save plan"}
        </button>
        {saved && <span className="text-[12px] text-emerald-400">Saved</span>}
      </div>
    </div>
  )
}
