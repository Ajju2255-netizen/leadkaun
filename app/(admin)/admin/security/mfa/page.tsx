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
    <div className="min-h-screen text-ink flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl glass-2 p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-sky-500" />
          <p className="text-[15px] font-black text-ink">Two-factor authentication</p>
        </div>

        {mode === "loading" && <p className="text-[13px] text-ink-soft">Checking your security factors…</p>}

        {mode === "enroll" && (
          <>
            <p className="text-[13px] text-ink-soft mb-3">Scan this with your authenticator app, then enter the 6-digit code.</p>
            {/* Base64 QR data URI from Supabase MFA — next/image adds no value here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr && <img src={qr} alt="TOTP QR" className="w-44 h-44 bg-white rounded-xl p-2 mx-auto mb-3 border border-hairline" />}
          </>
        )}
        {mode === "challenge" && (
          <p className="text-[13px] text-ink-soft mb-3">Enter the 6-digit code from your authenticator app.</p>
        )}

        {(mode === "enroll" || mode === "challenge") && (
          <form onSubmit={verify} className="space-y-3">
            <input inputMode="numeric" autoFocus required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="w-full h-11 rounded-lg bg-white/80 border border-hairline-strong px-3 text-center text-[18px] tracking-[0.4em] text-ink outline-none focus:border-sky-400" />
            {err && <p className="text-[12px] text-red-600">{err}</p>}
            <button type="submit" disabled={busy || code.length !== 6}
              className="btn-primary w-full h-10 text-[13px] disabled:opacity-50">
              {busy ? "Verifying…" : "Verify"}
            </button>
          </form>
        )}
        {err && mode === "loading" && <p className="text-[12px] text-red-600 mt-2">{err}</p>}
      </div>
    </div>
  )
}
