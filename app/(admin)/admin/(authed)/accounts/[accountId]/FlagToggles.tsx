"use client"

import { useState } from "react"

type Item = { key: string; label: string; enabled: boolean }

export function FlagToggles({
  accountId, items, canWrite = true,
}: { accountId: string; items: Item[]; canWrite?: boolean }) {
  const [flags, setFlags] = useState<Record<string, boolean>>(Object.fromEntries(items.map((i) => [i.key, i.enabled])))
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function toggle(key: string) {
    if (!canWrite) return
    const next = !flags[key]
    setBusy(key); setErr(null)
    setFlags((f) => ({ ...f, [key]: next }))
    const res = await fetch("/api/admin/platform/feature-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, key, enabled: next }),
    }).catch(() => null)
    if (!res || !res.ok) {
      setFlags((f) => ({ ...f, [key]: !next })) // revert on failure
      setErr("Could not save — the flag was reverted.")
    }
    setBusy(null)
  }

  return (
    <div>
      <div className="rounded-2xl glass-2 divide-y divide-hairline overflow-hidden">
        {items.map((i) => {
          const on = flags[i.key]
          return (
            <div key={i.key} className="px-4 py-2.5 flex items-center justify-between">
              <span className="text-[12.5px] text-ink-soft font-medium">{i.label}</span>
              <button
                onClick={() => toggle(i.key)}
                disabled={busy === i.key || !canWrite}
                title={canWrite ? undefined : "Requires the SUPER_ADMIN role"}
                aria-pressed={on}
                className={`relative w-10 h-5 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${on ? "bg-emerald-500" : "bg-slate-300"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
          )
        })}
      </div>
      {err && <p className="text-[11px] text-red-600 mt-1.5">{err}</p>}
    </div>
  )
}
