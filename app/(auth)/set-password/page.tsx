"use client"

/*
 * Set-password page — Coastal Sunrise.
 *
 * Where invited users land after accepting (see /api/auth/confirm, type=invite).
 * The confirm route has already established a session cookie; here the invitee
 * chooses a password so they can sign in normally afterwards, then lands on the
 * dashboard. Requires an active session — bounces to /login otherwise.
 */

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, ShieldCheck } from "lucide-react"
import { LeadkaunMark } from "@/components/shared/LeadkaunMark"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export default function SetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm,  setConfirm]  = useState("")
  const [show,     setShow]     = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [checking, setChecking] = useState(true)

  // The invite-confirm flow sets a session cookie before redirecting here.
  // If there's no session (direct visit), send them to sign in.
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/login")
      else setChecking(false)
    })
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }

    setLoading(true)
    const supabase = getSupabaseBrowserClient()
    const { error: upErr } = await supabase.auth.updateUser({ password })
    if (upErr) {
      setError(upErr.message)
      setLoading(false)
      return
    }
    // Hard redirect so the dashboard loads with the fresh session.
    window.location.href = "/dashboard"
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mesh">
        <LeadkaunMark size={44} gloss />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-mesh">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 12% 18%, rgba(125,211,252,0.55), transparent 70%), " +
            "radial-gradient(ellipse 65% 55% at 82% 88%, rgba(253,186,116,0.50), transparent 72%), " +
            "radial-gradient(ellipse 45% 40% at 88% 50%, rgba(34,211,238,0.30), transparent 70%), " +
            "var(--bg-pure)",
        }}
        aria-hidden
      />
      <div className="blob blob-lg blob-sky -top-32 -left-40 absolute" aria-hidden />
      <div className="blob blob-lg blob-peach -bottom-32 -right-32 absolute" style={{ animationDelay: "3s" }} aria-hidden />

      <div className="w-full max-w-[380px] space-y-7 relative z-10">

        <div className="flex flex-col items-center gap-3">
          <LeadkaunMark size={44} gloss />
          <div className="text-center">
            <h1 className="text-[22px] font-bold text-ink tracking-[-0.025em]">Set your password</h1>
            <p className="text-[13px] text-ink-muted mt-0.5">Choose a password to finish setting up your account</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="glass-3 gloss-edge rounded-2xl p-7 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-[12px] font-semibold text-ink-soft block">
              New password
            </label>
            <div className="relative">
              <input
                id="password"
                type={show ? "text" : "password"}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="
                  w-full h-10 px-3 pr-10 rounded-xl glass-1 gloss-edge
                  border border-white/70
                  text-[13px] text-ink placeholder:text-ink-faint
                  outline-none focus:border-sky-400 focus:[background:rgba(255,255,255,0.92)]
                  transition-all
                "
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-soft transition-colors"
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirm" className="text-[12px] font-semibold text-ink-soft block">
              Confirm password
            </label>
            <input
              id="confirm"
              type={show ? "text" : "password"}
              placeholder="Re-enter your password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="
                w-full h-10 px-3 rounded-xl glass-1 gloss-edge
                border border-white/70
                text-[13px] text-ink placeholder:text-ink-faint
                outline-none focus:border-sky-400 focus:[background:rgba(255,255,255,0.92)]
                transition-all
              "
            />
          </div>

          {error && (
            <p
              className="text-[12px] text-red-700 rounded-xl px-3 py-2"
              style={{
                background: "rgba(254, 226, 226, 0.85)",
                border: "1px solid rgba(252, 165, 165, 0.45)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="
              btn-primary shimmer-on-hover
              w-full h-11 mt-1 text-[13px]
              disabled:opacity-60 disabled:cursor-not-allowed
            "
          >
            <span className="relative z-[2] inline-flex items-center gap-1.5">
              {!loading && <ShieldCheck className="w-4 h-4" />}
              {loading ? "Saving…" : "Save password & continue"}
            </span>
          </button>
        </form>

      </div>
    </div>
  )
}
