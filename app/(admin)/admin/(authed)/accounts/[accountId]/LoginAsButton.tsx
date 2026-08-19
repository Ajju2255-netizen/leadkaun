"use client"

import { useState } from "react"
import { LogIn } from "lucide-react"
import { Button, Input } from "../../_components/ui"

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
      <Button variant="warn" onClick={() => setOpen(true)}>
        <LogIn className="w-4 h-4" />
        Login as customer
      </Button>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 w-[340px]">
      <p className="text-[11px] font-bold uppercase tracking-wider text-orange-600">Audited impersonation</p>
      <p className="text-[11.5px] text-ink-muted mt-1 leading-snug">
        Everything you do will be recorded against your admin account, and the customer sees a banner.
      </p>
      <Input
        autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void go() }}
        aria-label="Reason for impersonating this account"
        aria-invalid={!!err}
        placeholder="Reason (e.g. ticket #142 — bad grade)"
        className="w-full mt-2.5"
      />
      <div className="flex items-center gap-2 mt-2.5">
        <Button variant="warn" onClick={go} disabled={loading}>
          {loading ? "Starting…" : "Start session"}
        </Button>
        <Button onClick={() => { setOpen(false); setErr(null) }}>Cancel</Button>
      </div>
      {err && <p role="alert" className="text-[11px] text-red-600 mt-1.5">{err}</p>}
    </div>
  )
}
