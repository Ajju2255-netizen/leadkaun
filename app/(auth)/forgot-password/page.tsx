"use client"

/*
 * Forgot-password page — Coastal Sunrise.
 *
 * Mirrors the login surface (mesh background + floating glass-3 plate).
 * Sends a Supabase recovery email; the link routes through the existing
 * /api/auth/callback handler (exchanges the code for a session) and lands
 * the user on /settings/security, where they set a new password.
 */

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, MailCheck } from "lucide-react"
import { LeadkaunMark } from "@/components/shared/LeadkaunMark"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState("")
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = getSupabaseBrowserClient()
    const redirectTo = `${window.location.origin}/api/auth/callback?next=/settings/security`
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

    if (resetError) {
      setError(resetError.message)
      setLoading(false)
      return
    }

    // Always land on the confirmation state — never reveal whether an account
    // exists for the address (avoids account-enumeration on the auth surface).
    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-mesh">
      {/* Mesh background — sky NW + peach SE */}
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

        {/* ── Brand mark ───────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3">
          <LeadkaunMark size={44} gloss />
          <div className="text-center">
            <h1 className="text-[22px] font-bold text-ink tracking-[-0.025em]">Reset your password</h1>
            <p className="text-[13px] text-ink-muted mt-0.5">
              {sent ? "Check your inbox" : "We'll email you a reset link"}
            </p>
          </div>
        </div>

        {sent ? (
          /* ── Confirmation state ─────────────────────────────────────────── */
          <div className="glass-3 gloss-edge rounded-2xl p-7 space-y-4 text-center">
            <span className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center mx-auto">
              <MailCheck className="w-6 h-6 text-sky-600" strokeWidth={2.2} />
            </span>
            <p className="text-[13px] text-ink-soft leading-relaxed">
              If an account exists for <span className="font-semibold text-ink">{email}</span>, a
              password-reset link is on its way. The link opens a secure page where you can set a
              new password.
            </p>
            <p className="text-[12px] text-ink-muted">
              Didn&apos;t get it? Check spam, or{" "}
              <button
                type="button"
                onClick={() => setSent(false)}
                className="text-sky-600 font-semibold hover:text-sky-500 transition-colors underline-offset-4 hover:underline"
              >
                try another email
              </button>
              .
            </p>
          </div>
        ) : (
          /* ── Request form ───────────────────────────────────────────────── */
          <form onSubmit={handleSubmit} className="glass-3 gloss-edge rounded-2xl p-7 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-[12px] font-semibold text-ink-soft block">
                Email address
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              <span className="relative z-[2]">{loading ? "Sending link…" : "Send reset link"}</span>
            </button>
          </form>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        <p className="text-center text-[12px] text-ink-muted">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-sky-600 font-semibold hover:text-sky-500 transition-colors underline-offset-4 hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to sign in
          </Link>
        </p>

      </div>
    </div>
  )
}
