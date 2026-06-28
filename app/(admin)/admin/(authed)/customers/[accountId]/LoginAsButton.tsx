"use client"

import { useState } from "react"
import { LogIn } from "lucide-react"

/**
 * Starts an audited impersonation: asks the server for a one-time magic link,
 * then hands off to the customer app host (which logs in as the customer and
 * shows the persistent "viewing as administrator" banner).
 */
export function LoginAsButton({ accountId }: { accountId: string }) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function go() {
    setLoading(true); setErr(null)
    try {
      const res = await fetch("/api/admin/platform/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, reason: "Support" }),
      })
      const json = await res.json()
      if (!res.ok || !json.url) { setErr(json.error ?? "Could not start impersonation"); setLoading(false); return }
      window.location.href = json.url as string
    } catch {
      setErr("Network error"); setLoading(false)
    }
  }

  return (
    <div className="text-right">
      <button
        onClick={go}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-violet-500 to-fuchsia-600 hover:from-violet-400 hover:to-fuchsia-500 px-4 h-10 text-[13px] font-semibold text-white shadow-lg shadow-violet-900/40 disabled:opacity-50 transition-all active:scale-[0.98]"
      >
        <LogIn className="w-4 h-4" />
        {loading ? "Starting…" : "Login as Customer"}
      </button>
      {err && <p className="text-[11px] text-rose-400 mt-1.5">{err}</p>}
    </div>
  )
}
