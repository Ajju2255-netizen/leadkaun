"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { LeadkaunMark } from "@/components/shared/LeadkaunMark"
import { Target, ListChecks, AlertCircle } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { registerAction } from "./actions"

const inputCls =
  "w-full h-10 px-3 rounded-xl glass-1 gloss-edge border border-white/70 " +
  "text-[13px] text-ink placeholder:text-ink-faint outline-none " +
  "focus:border-sky-400 focus:[background:rgba(255,255,255,0.92)] transition-all"

export default function RegisterPage() {
  const router = useRouter()

  const [form, setForm] = useState({
    orgName:   "",
    firstName: "",
    lastName:  "",
    email:     "",
    password:  "",
  })
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = await registerAction(form)

    if (!result.success) {
      setError(result.error)
      setLoading(false)
      return
    }

    const supabase = getSupabaseBrowserClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email:    form.email,
      password: form.password,
    })

    if (signInError) {
      setError("Account created but sign-in failed. Please go to login.")
      setLoading(false)
      return
    }

    router.push(result.redirectTo)
    router.refresh()
  }

  return (
    <div className="min-h-screen flex relative overflow-hidden">

      {/* Mesh background */}
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

      {/* ── Left value-prop panel (lg+) ──────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-14 xl:px-20 relative z-10">
        <LeadkaunMark size={48} gloss />
        <h2 className="mt-8 text-[38px] font-extrabold text-ink tracking-tight leading-[1.12] max-w-md">
          Know who to call next — every morning.
        </h2>
        <p className="mt-4 text-[15px] text-ink-soft max-w-md leading-relaxed">
          Leadkaun scores every lead on fit, intent &amp; quality and ranks your day — so reps stop guessing and start closing.
        </p>
        <ul className="mt-8 space-y-3.5 max-w-md">
          {[
            { Icon: Target,      text: "Every lead graded A–F on fit, intent & quality" },
            { Icon: ListChecks,  text: "A priority queue that tells reps who to call next" },
            { Icon: AlertCircle, text: "Catch missed opportunities before they go cold" },
          ].map(({ Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-sky-600" strokeWidth={2.2} />
              </span>
              <span className="text-[14px] text-ink-soft leading-snug pt-1">{text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Right: form column ───────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-4 py-10 relative z-10">
      <div className="w-full max-w-[400px] space-y-7">

        {/* ── Brand mark (mobile only — left panel covers desktop) ─────────── */}
        <div className="flex flex-col items-center gap-3 lg:hidden">
          <LeadkaunMark size={44} gloss />
          <div className="text-center">
            <h1 className="text-[22px] font-bold text-ink tracking-[-0.025em]">Leadkaun</h1>
            <p className="text-[13px] text-ink-muted mt-0.5">Create your workspace</p>
          </div>
        </div>

        {/* ── Form ────────────────────────────────────────────────────────── */}
        <form
          onSubmit={handleSubmit}
          className="glass-3 gloss-edge rounded-2xl p-7 space-y-4"
        >

          {/* Org name */}
          <div className="space-y-1.5">
            <label htmlFor="orgName" className="text-[12px] font-semibold text-ink-soft block">
              Organisation name
            </label>
            <input
              id="orgName" name="orgName" required
              placeholder="Acme Real Estate"
              value={form.orgName} onChange={handleChange}
              className={inputCls}
            />
          </div>

          {/* First + last name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="firstName" className="text-[12px] font-semibold text-ink-soft block">
                First name
              </label>
              <input
                id="firstName" name="firstName" required
                placeholder="Arjun"
                value={form.firstName} onChange={handleChange}
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="lastName" className="text-[12px] font-semibold text-ink-soft block">
                Last name
              </label>
              <input
                id="lastName" name="lastName" required
                placeholder="Sharma"
                value={form.lastName} onChange={handleChange}
                className={inputCls}
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-[12px] font-semibold text-ink-soft block">
              Work email
            </label>
            <input
              id="email" name="email" type="email" required
              autoComplete="email"
              placeholder="arjun@acmerealty.in"
              value={form.email} onChange={handleChange}
              className={inputCls}
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-[12px] font-semibold text-ink-soft block">
              Password
            </label>
            <input
              id="password" name="password" type="password" required
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              minLength={8}
              value={form.password} onChange={handleChange}
              className={inputCls}
            />
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
            className="btn-primary shimmer-on-hover w-full h-11 mt-1 text-[13px] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span className="relative z-[2]">{loading ? "Creating account…" : "Create account"}</span>
          </button>
        </form>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <p className="text-center text-[12px] text-ink-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-sky-600 font-semibold hover:text-sky-500 transition-colors underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>

      </div>
      </div>
    </div>
  )
}
