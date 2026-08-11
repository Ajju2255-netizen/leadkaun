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
    <div className="min-h-screen text-ink flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-cyan-500 flex items-center justify-center shadow-[0_4px_12px_rgba(14,165,233,0.28)]">
            <ShieldCheck className="w-5 h-5 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <p className="text-[15px] font-black tracking-tight text-ink">Mission Control</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-orange-500">Leadkaun internal</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3 rounded-2xl glass-2 p-5">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block mb-1.5">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 rounded-lg bg-white/80 border border-hairline-strong px-3 text-[13px] text-ink outline-none focus:border-sky-400" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block mb-1.5">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 rounded-lg bg-white/80 border border-hairline-strong px-3 text-[13px] text-ink outline-none focus:border-sky-400" />
          </div>
          {err && <p className="text-[12px] text-red-600">{err}</p>}
          <button type="submit" disabled={loading}
            className="btn-primary w-full h-10 text-[13px] disabled:opacity-50">
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-[11px] text-ink-muted text-center pt-1">Access requires an allowlisted admin account + MFA.</p>
        </form>
      </div>
    </div>
  )
}
