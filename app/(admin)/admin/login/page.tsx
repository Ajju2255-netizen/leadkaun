"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Button, Input } from "../(authed)/_components/ui"

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
    router.push("/")
  }

  return (
    <div className="min-h-screen text-ink flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-cyan-500 flex items-center justify-center shadow-[0_4px_12px_rgba(14,165,233,0.28)]">
            <ShieldCheck className="w-5 h-5 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <p className="text-[15px] font-semibold tracking-[-0.02em] text-ink">Mission Control</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-orange-500">Leadkaun internal</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200/70 bg-white p-5">
          <div>
            <label htmlFor="admin-email" className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block mb-1.5">Email</label>
            <Input id="admin-email" type="email" autoComplete="username" required
              value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-10" />
          </div>
          <div>
            <label htmlFor="admin-password" className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block mb-1.5">Password</label>
            <Input id="admin-password" type="password" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)} className="w-full h-10" />
          </div>
          {err && <p role="alert" className="text-[12px] text-red-600">{err}</p>}
          <Button type="submit" variant="primary" disabled={loading} className="w-full h-10">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-[11px] text-ink-muted text-center pt-1">Access requires an allowlisted admin account + MFA.</p>
        </form>
      </div>
    </div>
  )
}
