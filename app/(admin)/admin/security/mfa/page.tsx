"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Button, Input } from "../../(authed)/_components/ui"

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
      if (aal?.currentLevel === "aal2") { router.push("/"); return }
      const { data: factors } = await supabase.auth.mfa.listFactors()
      // `factors.totp` is verified-only by definition; abandoned enrolments show
      // up solely in `factors.all`.
      const verified = factors?.totp?.[0]
      if (verified) { setFactorId(verified.id); setMode("challenge"); return }
      // Clear any half-finished enrolment first. Supabase rejects a second factor
      // sharing a friendly name, so an abandoned enrolment would otherwise wedge
      // this page on that error — and with MFA required that locks the admin out
      // of Mission Control entirely, since every other route redirects here.
      await Promise.all(
        (factors?.all ?? [])
          .filter((f) => f.factor_type === "totp" && f.status !== "verified")
          .map((f) => supabase.auth.mfa.unenroll({ factorId: f.id })),
      )
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
    // The session is AAL2 from here, so this call passes requirePlatformAdmin.
    // Best-effort: a failed stamp must not block a successful enrolment.
    await fetch("/api/admin/platform/mfa-verified", { method: "POST" }).catch(() => {})
    router.push("/")
  }

  return (
    <div className="min-h-screen text-ink flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200/70 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-sky-500" />
          <p className="text-[15px] font-semibold text-ink">Two-factor authentication</p>
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
            <Input inputMode="numeric" autoFocus required autoComplete="one-time-code"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              aria-label="Six-digit authenticator code"
              placeholder="000000"
              className="w-full h-11 text-center text-[18px] tracking-[0.4em]" />
            {err && <p role="alert" className="text-[12px] text-red-600">{err}</p>}
            <Button type="submit" variant="primary" disabled={busy || code.length !== 6} className="w-full h-10">
              {busy ? "Verifying…" : "Verify"}
            </Button>
          </form>
        )}
        {err && mode === "loading" && <p className="text-[12px] text-red-600 mt-2">{err}</p>}
      </div>
    </div>
  )
}
