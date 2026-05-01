"use client"

import { useState, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { User, ShieldCheck } from "lucide-react"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { Skeleton } from "@/components/ui/skeleton"

const ROLE_LABELS: Record<string, string> = {
  ADMIN:   "Admin",
  MANAGER: "Manager",
  REP:     "Sales Rep",
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN:   "bg-sky-50 text-sky-700 border-sky-200",
  MANAGER: "bg-violet-50 text-violet-700 border-violet-200",
  REP:     "bg-slate-100 text-slate-600 border-slate-200",
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[12px] font-semibold text-slate-600">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

const inputCls = `w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-[13px]
  text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2
  focus:ring-sky-500/30 focus:border-sky-400 transition-all`

const readonlyCls = `w-full px-3.5 py-2.5 rounded-xl border border-slate-100 bg-slate-50
  text-[13px] text-slate-400 cursor-not-allowed select-none`

export default function ProfilePage() {
  const qc = useQueryClient()
  const { data: session, isLoading } = useCurrentUser()

  const [firstName,  setFirstName]  = useState("")
  const [lastName,   setLastName]   = useState("")
  const [savingInfo, setSavingInfo] = useState(false)

  useEffect(() => {
    if (session) {
      setFirstName(session.user.firstName)
      setLastName(session.user.lastName)
    }
  }, [session])

  async function handleSaveInfo() {
    if (!firstName.trim() || !lastName.trim() || savingInfo) return
    setSavingInfo(true)
    const res = await fetch("/api/profile", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ first_name: firstName.trim(), last_name: lastName.trim() }),
    })
    setSavingInfo(false)
    if (res.ok) {
      toast.success("Profile updated")
      qc.invalidateQueries({ queryKey: ["auth", "user"] })
    } else {
      toast.error("Failed to save")
    }
  }

  if (isLoading) return (
    <div className="space-y-5 max-w-xl">
      <Skeleton className="h-8 w-48 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
    </div>
  )

  return (
    <div className="space-y-5 max-w-xl">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_18px_rgba(14,165,233,0.32)]">
          <User className="w-6 h-6 text-white" strokeWidth={2.4} />
        </div>
        <div>
          <h1 className="text-[26px] font-extrabold text-slate-900 tracking-tight leading-tight">Profile</h1>
          <p className="text-[13px] text-slate-500 mt-0.5">Manage your personal details.</p>
        </div>
      </div>

      {/* Personal info */}
      <div className="glass-card px-5 py-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <User className="w-3.5 h-3.5 text-slate-400" />
          <p className="section-label">Personal info</p>
        </div>

        {/* Avatar + role */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
            <span className="text-[16px] font-black text-sky-700">
              {[session?.user.firstName, session?.user.lastName]
                .filter(Boolean).map((n) => n![0].toUpperCase()).join("").slice(0,2) || "U"}
            </span>
          </div>
          <div>
            <p className="text-[14px] font-bold text-slate-900">
              {session?.user.firstName} {session?.user.lastName}
            </p>
            <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${ROLE_COLORS[session?.user.role ?? "REP"]}`}>
              {ROLE_LABELS[session?.user.role ?? "REP"]}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="First name">
            <input className={inputCls} value={firstName}
              onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
          </Field>
          <Field label="Last name">
            <input className={inputCls} value={lastName}
              onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
          </Field>
        </div>

        <Field label="Email address" hint="Email is managed by your authentication provider and cannot be changed here.">
          <div className={readonlyCls}>{session?.user.email}</div>
        </Field>

        <Field label="Role" hint="Your role is set by your account admin.">
          <div className={readonlyCls}>{ROLE_LABELS[session?.user.role ?? "REP"]}</div>
        </Field>

        <button
          onClick={handleSaveInfo}
          disabled={savingInfo || !firstName.trim() || !lastName.trim()}
          className="h-9 px-5 rounded-full bg-sky-600 hover:bg-sky-700 disabled:opacity-50
                     text-white text-[13px] font-semibold transition-all active:scale-[0.97]"
        >
          {savingInfo ? "Saving…" : "Save changes"}
        </button>
      </div>

      {/* Account info */}
      <div className="glass-card px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
          <p className="section-label">Account info</p>
        </div>
        <div className="space-y-2 text-[12px] text-slate-500">
          <div className="flex items-center justify-between">
            <span>User ID</span>
            <span className="font-mono text-[11px] text-slate-400">{session?.user.id.slice(0, 16)}…</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Organisation ID</span>
            <span className="font-mono text-[11px] text-slate-400">{session?.account.id.slice(0, 16)}…</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Workspace</span>
            <span className="font-semibold text-slate-700">{session?.account.name}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
