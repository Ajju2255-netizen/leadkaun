"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

type Mode = "loading" | "enroll" | "challenge" | "done"

export default function AdminMfa() {
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()
  const [mode, setMode] = useState<Mode>("loading")
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Decide enroll vs challenge based on existing verified factors.
  useEffect(() => {
    (async () => {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.currentLevel === "aal2") { router.push("/admin"); return }
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp?.find((f) => f.status === "verified")
      if (totp) { setFactorId(totp.id); setMode("challenge"); return }
      const { data: e, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Mission Control" })
      if (error || !e) { setErr(error?.message ?? "Could not start MFA enrolment"); return }
      setFactorId(e.id); setQr(e.totp.qr_code); setMode("enroll")
    })().catch((e) => setErr(String(e)))
  }, [router, supabase])

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    if (!factorId) return
    setBusy(true); setErr(null)
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
    if (chErr || !ch) { setErr(chErr?.message ?? "Challenge failed"); setBusy(false); return }
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code })
    if (error) { setErr(error.message); setBusy(false); return }
    router.push("/admin")
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/50 p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-violet-400" />
          <p className="text-[15px] font-bold">Two-factor authentication</p>
        </div>

        {mode === "loading" && <p className="text-[13px] text-slate-400">Checking your security factors…</p>}

        {mode === "enroll" && (
          <>
            <p className="text-[13px] text-slate-400 mb-3">Scan this with your authenticator app, then enter the 6-digit code.</p>
            {qr && <img src={qr} alt="TOTP QR" className="w-44 h-44 bg-white rounded-lg p-2 mx-auto mb-3" />}
          </>
        )}
        {mode === "challenge" && (
          <p className="text-[13px] text-slate-400 mb-3">Enter the 6-digit code from your authenticator app.</p>
        )}

        {(mode === "enroll" || mode === "challenge") && (
          <form onSubmit={verify} className="space-y-3">
            <input inputMode="numeric" autoFocus required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="w-full h-11 rounded-lg bg-slate-800 border border-white/10 px-3 text-center text-[18px] tracking-[0.4em] text-white outline-none focus:border-violet-400" />
            {err && <p className="text-[12px] text-rose-400">{err}</p>}
            <button type="submit" disabled={busy || code.length !== 6}
              className="w-full h-10 rounded-lg bg-gradient-to-b from-violet-500 to-fuchsia-600 hover:from-violet-400 hover:to-fuchsia-500 text-white text-[13px] font-semibold disabled:opacity-50 transition-all">
              {busy ? "Verifying…" : "Verify"}
            </button>
          </form>
        )}
        {err && mode === "loading" && <p className="text-[12px] text-rose-400 mt-2">{err}</p>}
      </div>
    </div>
  )
}
