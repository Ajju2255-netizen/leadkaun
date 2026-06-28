"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export default function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setErr(null)
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setErr(error.message); setLoading(false); return }
    // The (authed) layout re-checks platform-admin status + MFA and routes onward.
    router.push("/admin")
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <p className="text-[15px] font-bold tracking-tight">Mission Control</p>
            <p className="text-[11px] text-slate-400">Leadkaun platform admin</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/50 p-5">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 rounded-lg bg-slate-800 border border-white/10 px-3 text-[13px] text-white outline-none focus:border-violet-400" />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 rounded-lg bg-slate-800 border border-white/10 px-3 text-[13px] text-white outline-none focus:border-violet-400" />
          </div>
          {err && <p className="text-[12px] text-rose-400">{err}</p>}
          <button type="submit" disabled={loading}
            className="w-full h-10 rounded-lg bg-gradient-to-b from-violet-500 to-fuchsia-600 hover:from-violet-400 hover:to-fuchsia-500 text-white text-[13px] font-semibold disabled:opacity-50 transition-all">
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-[11px] text-slate-500 text-center pt-1">Access requires an allowlisted admin account + MFA.</p>
        </form>
      </div>
    </div>
  )
}
