"use client"

/*
 * Login page — Intercom-inspired.
 *
 * Design intent:
 *   Trust is the primary emotion a login page must convey. We achieve this
 *   through:
 *     - Generous whitespace (calm = trustworthy)
 *     - Clean brand mark at top (identity anchoring)
 *     - No visual noise (no sidebars, decorations, illustrations)
 *     - Single clear CTA (no decision paralysis)
 *     - Soft slate-50 background so the white form "lifts" slightly
 *
 *   The brand mark uses an indigo-filled Zap in a rounded square — same as
 *   the sidebar logo — creating visual continuity from login → app.
 *
 *   Error state: red text below the field it belongs to, not a banner.
 *   Banners feel like a reprimand; inline errors feel like help.
 */

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Zap } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const redirectTo   = searchParams.get("redirectTo") ?? "/dashboard"

  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
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
    <div className="w-full max-w-[360px] space-y-8">

      {/* ── Brand mark ────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-200">
          <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        <div className="text-center">
          <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">Leadkaun</h1>
          <p className="text-[13px] text-slate-400 mt-0.5">Sign in to your workspace</p>
        </div>
      </div>

      {/* ── Form ──────────────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.08),0_4px_16px_rgba(15,23,42,0.06)] p-7 space-y-4"
      >

        {/* Email */}
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-[12px] font-semibold text-slate-600 block">
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
              w-full h-10 px-3 rounded-lg border border-slate-200 bg-white
              text-[13px] text-slate-800 placeholder:text-slate-300
              outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100
              transition-colors
            "
          />
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-[12px] font-semibold text-slate-600 block">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="
              w-full h-10 px-3 rounded-lg border border-slate-200 bg-white
              text-[13px] text-slate-800 placeholder:text-slate-300
              outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100
              transition-colors
            "
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-[12px] text-red-500 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="
            w-full h-10 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800
            text-white text-[13px] font-semibold transition-colors
            disabled:opacity-60 disabled:cursor-not-allowed
            mt-1
          "
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <p className="text-center text-[12px] text-slate-400">
        New to Leadkaun?{" "}
        <Link href="/register" className="text-slate-600 font-medium hover:text-indigo-600 transition-colors">
          Create an account
        </Link>
      </p>

    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <Suspense fallback={
        <div className="w-[360px] h-72 rounded-2xl bg-white shadow-sm animate-pulse" />
      }>
        <LoginForm />
      </Suspense>
    </div>
  )
}
