"use client"

import { useState } from "react"

type Item = { key: string; label: string; enabled: boolean }

export function FlagToggles({ accountId, items }: { accountId: string; items: Item[] }) {
  const [flags, setFlags] = useState<Record<string, boolean>>(Object.fromEntries(items.map((i) => [i.key, i.enabled])))
  const [busy, setBusy] = useState<string | null>(null)

  async function toggle(key: string) {
    const next = !flags[key]
    setBusy(key)
    setFlags((f) => ({ ...f, [key]: next }))
    const res = await fetch("/api/admin/platform/feature-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, key, enabled: next }),
    }).catch(() => null)
    if (!res || !res.ok) setFlags((f) => ({ ...f, [key]: !next })) // revert on failure
    setBusy(null)
  }

  return (
    <div className="rounded-xl border border-white/10 divide-y divide-white/5">
      {items.map((i) => {
        const on = flags[i.key]
        return (
          <div key={i.key} className="px-4 py-2.5 flex items-center justify-between">
            <span className="text-[13px] text-slate-200">{i.label}</span>
            <button
              onClick={() => toggle(i.key)}
              disabled={busy === i.key}
              className={`relative w-10 h-5 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-emerald-500" : "bg-slate-600"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
