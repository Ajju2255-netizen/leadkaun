"use client"

import { useState } from "react"
import { Toggle } from "../../_components/ui"

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
      <div className="rounded-2xl border border-slate-200/70 bg-white divide-y divide-hairline overflow-hidden">
        {items.map((i) => {
          const on = flags[i.key]
          return (
            <div key={i.key} className="px-4 py-2.5 flex items-center justify-between">
              <span className="text-[12.5px] text-ink-soft font-medium">{i.label}</span>
              <span title={canWrite ? undefined : "Requires the SUPER_ADMIN role"}>
                <Toggle
                  on={on}
                  label={`${i.label} — ${on ? "enabled" : "disabled"}`}
                  onClick={() => toggle(i.key)}
                  disabled={busy === i.key || !canWrite}
                />
              </span>
            </div>
          )
        })}
      </div>
      {/* role=alert so the revert is announced — an optimistic toggle that
          silently snaps back is otherwise invisible to a screen reader. */}
      {err && <p role="alert" className="text-[11px] text-red-600 mt-1.5">{err}</p>}
    </div>
  )
}
