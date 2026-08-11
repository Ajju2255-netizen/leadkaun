"use client"

import { useState } from "react"
import { LogIn } from "lucide-react"

/**
 * Starts an audited impersonation: the server writes the ImpersonationLog row
 * FIRST, then mints a one-time magic link. The customer app shows a persistent
 * "viewing as administrator" banner until it's exited.
 *
 * A reason is required before the request goes out — an audit row that just
 * says "Support" for everything is not an audit trail.
 */
export function LoginAsButton({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function go() {
    if (reason.trim().length < 4) { setErr("Give a reason — it goes in the audit log."); return }
    setLoading(true); setErr(null)
    try {
      const res = await fetch("/api/admin/platform/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, reason: reason.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json.url) { setErr(json.error ?? "Could not start impersonation"); setLoading(false); return }
      window.location.href = json.url as string
    } catch {
      setErr("Network error"); setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-orange-400 to-orange-500 px-4 h-10 text-[13px] font-bold text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)] hover:from-orange-300 hover:to-orange-400 transition-all active:scale-[0.98]"
      >
        <LogIn className="w-4 h-4" />
        Login as customer
      </button>
    )
  }

  return (
    <div className="rounded-2xl glass-2 px-4 py-3 w-[340px]">
      <p className="text-[11px] font-bold uppercase tracking-wider text-orange-600">Audited impersonation</p>
      <p className="text-[11.5px] text-ink-muted mt-1 leading-snug">
        Everything you do will be recorded against your admin account, and the customer sees a banner.
      </p>
      <input
        autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void go() }}
        placeholder="Reason (e.g. ticket #142 — bad grade)"
        className="mt-2.5 w-full h-9 rounded-lg bg-white/80 border border-hairline-strong px-2.5 text-[12.5px] text-ink outline-none focus:border-orange-400"
      />
      <div className="flex items-center gap-2 mt-2.5">
        <button
          onClick={go} disabled={loading}
          className="h-9 px-3.5 rounded-full bg-gradient-to-b from-orange-400 to-orange-500 text-[12.5px] font-bold text-white disabled:opacity-50"
        >
          {loading ? "Starting…" : "Start session"}
        </button>
        <button
          onClick={() => { setOpen(false); setErr(null) }}
          className="h-9 px-3 rounded-full border border-hairline-strong bg-white/70 text-[12.5px] font-semibold text-ink-soft hover:text-ink"
        >
          Cancel
        </button>
      </div>
      {err && <p className="text-[11px] text-red-600 mt-1.5">{err}</p>}
    </div>
  )
}
