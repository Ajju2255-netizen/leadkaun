"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Shield } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

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

export default function SecurityPage() {
  const [newPassword,     setNewPassword]     = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving,          setSaving]          = useState(false)

  async function handleChangePassword() {
    if (saving) return
    if (newPassword.length < 8) { toast.error("Password must be at least 8 characters"); return }
    if (newPassword !== confirmPassword) { toast.error("Passwords don't match"); return }
    setSaving(true)
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSaving(false)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success("Password updated")
      setNewPassword("")
      setConfirmPassword("")
    }
  }

  return (
    <div className="space-y-5 max-w-xl">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_18px_rgba(14,165,233,0.32)]">
          <Shield className="w-6 h-6 text-white" strokeWidth={2.4} />
        </div>
        <div>
          <h1 className="text-[28px] font-bold text-ink tracking-[-0.02em] leading-tight">Security</h1>
          <p className="text-[13px] text-slate-500 mt-0.5">Update your password.</p>
        </div>
      </div>

      <div className="glass-card px-5 py-5 space-y-4">
        <Field label="New password" hint="Minimum 8 characters.">
          <input type="password" className={inputCls} value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password" autoComplete="new-password" />
        </Field>

        <Field label="Confirm new password">
          <input
            type="password"
            className={`${inputCls} ${confirmPassword && confirmPassword !== newPassword ? "border-red-300 focus:border-red-400 focus:ring-red-500/20" : ""}`}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat new password" autoComplete="new-password"
          />
          {confirmPassword && confirmPassword !== newPassword && (
            <p className="text-[11px] text-red-500 mt-1">Passwords don&apos;t match</p>
          )}
        </Field>

        <button
          onClick={handleChangePassword}
          disabled={saving || !newPassword || !confirmPassword || newPassword !== confirmPassword}
          className="h-9 px-5 rounded-full bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)] disabled:opacity-50
                     text-white text-[13px] font-semibold transition-all active:scale-[0.97]"
        >
          {saving ? "Updating…" : "Update password"}
        </button>
      </div>
    </div>
  )
}
