"use client"

/*
 * Login page — Coastal Sunrise.
 *
 * Trust-first auth surface. Mesh sky+peach background with a floating glass-3
 * form plate. LeadkaunMark + wordmark replaces the indigo Zap. Inputs and
 * buttons mirror the Coastal Sunrise gloss recipe used everywhere else.
 */

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Eye, EyeOff } from "lucide-react"
import { LeadkaunMark } from "@/components/shared/LeadkaunMark"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const redirectTo   = searchParams.get("redirectTo") ?? "/dashboard"

  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = getSupabaseBrowserClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    router.push(redirectTo)
    router.refresh()
  }

  return (
    <div className="w-full max-w-[380px] space-y-7 relative z-10">

      {/* ── Brand mark ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-3">
        <LeadkaunMark size={44} gloss />
        <div className="text-center">
          <h1 className="text-[22px] font-bold text-ink tracking-[-0.025em]">Leadkaun</h1>
          <p className="text-[13px] text-ink-muted mt-0.5">Sign in to your workspace</p>
        </div>
      </div>

      {/* ── Form ────────────────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="glass-3 gloss-edge rounded-2xl p-7 space-y-4"
      >

        {/* Email */}
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

        {/* Password */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-[12px] font-semibold text-ink-soft block">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-[11px] font-medium text-sky-600 hover:text-sky-500 transition-colors underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="
                w-full h-10 pl-3 pr-10 rounded-xl glass-1 gloss-edge
                border border-white/70
                text-[13px] text-ink placeholder:text-ink-faint
                outline-none focus:border-sky-400 focus:[background:rgba(255,255,255,0.92)]
                transition-all
              "
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
              className="
                absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md
                text-ink-faint hover:text-ink-soft transition-colors
              "
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Error */}
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

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="
            btn-primary shimmer-on-hover
            w-full h-11 mt-1 text-[13px]
            disabled:opacity-60 disabled:cursor-not-allowed
          "
        >
          <span className="relative z-[2]">{loading ? "Signing in…" : "Sign in"}</span>
        </button>
      </form>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <p className="text-center text-[12px] text-ink-muted">
        New to Leadkaun?{" "}
        <Link href="/register" className="text-sky-600 font-semibold hover:text-sky-500 transition-colors underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>

    </div>
  )
}

export default function LoginPage() {
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

      {/* Drifting blob accents */}
      <div className="blob blob-lg blob-sky -top-32 -left-40 absolute" aria-hidden />
      <div className="blob blob-lg blob-peach -bottom-32 -right-32 absolute" style={{ animationDelay: "3s" }} aria-hidden />

      <Suspense fallback={
        <div className="w-[380px] h-80 rounded-2xl glass-2 gloss-edge animate-pulse" />
      }>
        <LoginForm />
      </Suspense>
    </div>
  )
}
