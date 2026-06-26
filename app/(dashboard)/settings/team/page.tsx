"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { UserPlus, Users, X, ShieldCheck, UserCog, Layers, Trash2, Check, Lock } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { ThemedSelect } from "@/components/shared/ThemedSelect"
import { ModalPortal } from "@/components/shared/ModalPortal"
import { useCurrentUser } from "@/hooks/useCurrentUser"

interface Member {
  id: string
  email: string
  first_name: string
  last_name: string
  role: "ADMIN" | "MANAGER" | "REP"
  is_active: boolean
  _count: { assigned_leads: number }
}

type Role = "ADMIN" | "MANAGER" | "REP"

async function fetchMembers(): Promise<{ members: Member[] }> {
  const res = await fetch("/api/team/members")
  if (!res.ok) throw new Error("Failed")
  // API returns { members } directly via apiSuccess({members}) — accept both shapes
  return res.json().then((r) => r?.members ? r : (r?.data ?? { members: [] }))
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN:   "bg-sky-50 text-sky-700 border-sky-200",
  MANAGER: "bg-violet-50 text-violet-700 border-violet-200",
  REP:     "bg-slate-100 text-slate-600 border-slate-200",
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin", MANAGER: "Manager", REP: "Rep",
}

const ROLE_OPTIONS = [
  { value: "REP",     label: "Rep" },
  { value: "MANAGER", label: "Manager" },
  { value: "ADMIN",   label: "Admin" },
]

function Avatar({ name, active }: { name: string; active: boolean }) {
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-black shrink-0
      ${active ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-400"}`}>
      {initials}
    </div>
  )
}

export default function TeamPage() {
  const qc = useQueryClient()
  const { data: me, isLoading: meLoading } = useCurrentUser()
  const isAdmin = me?.user.role === "ADMIN"
  const myId = me?.user.id

  const { data, isLoading } = useQuery<{ members: Member[] }>({
    queryKey: ["team-members"],
    queryFn:  fetchMembers,
  })

  const [inviteEmail,   setInviteEmail]   = useState("")
  const [inviteRole,    setInviteRole]    = useState<"REP" | "MANAGER">("REP")
  const [inviteLoading, setInviteLoading] = useState(false)

  const [deactivateTarget, setDeactivateTarget] = useState<Member | null>(null)
  const [reassignTo,       setReassignTo]       = useState("")
  const [deactivating,     setDeactivating]     = useState(false)

  const [roleTarget, setRoleTarget] = useState<Member | null>(null)
  const [newRole,    setNewRole]    = useState<Role>("REP")
  const [roleSaving, setRoleSaving] = useState(false)

  const [wsTarget, setWsTarget] = useState<Member | null>(null)

  const [removeTarget,  setRemoveTarget]  = useState<Member | null>(null)
  const [removing,      setRemoving]       = useState(false)

  const members    = data?.members ?? []
  const activeReps = members.filter((m) => m.is_active && m.role === "REP")

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteLoading(true)
    try {
      const res  = await fetch("/api/team/invite", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Invite failed")
      toast.success(`Invite sent to ${inviteEmail}`)
      setInviteEmail("")
      qc.invalidateQueries({ queryKey: ["team-members"] })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Invite failed")
    } finally {
      setInviteLoading(false)
    }
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return
    setDeactivating(true)
    const body: Record<string, unknown> = { is_active: false }
    if (reassignTo) body.reassign_to_rep_id = reassignTo
    const res  = await fetch(`/api/team/members/${deactivateTarget.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    })
    const json = await res.json()
    setDeactivating(false)
    if (!res.ok) { toast.error(json.error ?? "Failed to deactivate"); return }
    toast.success(`${deactivateTarget.first_name} deactivated`)
    setDeactivateTarget(null)
    setReassignTo("")
    qc.invalidateQueries({ queryKey: ["team-members"] })
  }

  async function handleRoleChange() {
    if (!roleTarget) return
    setRoleSaving(true)
    const res  = await fetch(`/api/team/members/${roleTarget.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ role: newRole }),
    })
    const json = await res.json()
    setRoleSaving(false)
    if (!res.ok) { toast.error(json.error ?? "Failed to update role"); return }
    toast.success(`Role updated to ${ROLE_LABELS[newRole]}`)
    setRoleTarget(null)
    qc.invalidateQueries({ queryKey: ["team-members"] })
  }

  async function handleRemove() {
    if (!removeTarget) return
    setRemoving(true)
    const res = await fetch(`/api/team/members/${removeTarget.id}`, { method: "DELETE" })
    const json = await res.json().catch(() => ({}))
    setRemoving(false)
    if (!res.ok) { toast.error(json.error ?? "Failed to remove"); return }
    toast.success(`${removeTarget.first_name} removed`)
    setRemoveTarget(null)
    qc.invalidateQueries({ queryKey: ["team-members"] })
  }

  // ── Role still resolving: hold the management UI back so a non-admin never
  //    sees admin controls flash before their role is known. ────────────────────
  if (meLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Header />
        <div className="glass-card px-5 py-5 space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      </div>
    )
  }

  // ── Non-admin: read-only view ──────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Header />
        <div className="glass-card px-5 py-8 flex flex-col items-center text-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <Lock className="w-5 h-5 text-slate-400" />
          </div>
          <p className="text-[14px] font-bold text-slate-800">Admins only</p>
          <p className="text-[13px] text-slate-500 max-w-xs">
            Only workspace admins can invite members or manage team access.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      <Header />

      {/* ── Invite card ──────────────────────────────────────────────────── */}
      <div className="glass-card px-5 py-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-sky-50 flex items-center justify-center">
            <UserPlus className="w-4 h-4 text-sky-600" />
          </div>
          <p className="text-[14px] font-bold text-slate-900">Invite a Team Member</p>
        </div>
        <form onSubmit={handleInvite} className="flex gap-2.5 items-end">
          <div className="flex-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Email
            </label>
            <input
              type="email"
              required
              placeholder="rep@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13px]
                         focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            />
          </div>
          <div className="w-36">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Role
            </label>
            <ThemedSelect
              value={inviteRole}
              onValueChange={(v) => setInviteRole(v as "REP" | "MANAGER")}
              options={[{ value: "REP", label: "Rep" }, { value: "MANAGER", label: "Manager" }]}
              className="!h-[42px]"
              aria-label="Role"
            />
          </div>
          <button
            type="submit"
            disabled={inviteLoading}
            className="h-[42px] px-5 rounded-xl text-white text-[13px] font-semibold transition-all duration-150
                       bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600
                       shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]
                       disabled:opacity-50 active:scale-[0.98] shrink-0"
          >
            {inviteLoading ? "Sending…" : "Send Invite"}
          </button>
        </form>
      </div>

      {/* ── Members list ─────────────────────────────────────────────────── */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-slate-400" />
            <p className="text-[13px] font-bold text-slate-800">
              Members
              {!isLoading && (
                <span className="text-slate-400 font-normal ml-1.5">· {members.length}</span>
              )}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : members.length === 0 ? (
          <div className="px-5 py-12 text-center text-[13px] text-slate-400">No team members yet.</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {members.map((m) => {
              const isSelf = m.id === myId
              return (
              <div key={m.id} className={`px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50 transition-colors ${!m.is_active ? "opacity-60" : ""}`}>
                <Avatar name={`${m.first_name} ${m.last_name}`} active={m.is_active} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[13px] font-semibold text-slate-800 leading-tight">
                      {m.first_name} {m.last_name}
                    </p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ROLE_COLORS[m.role]}`}>
                      {ROLE_LABELS[m.role]}
                    </span>
                    {isSelf && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-600 border border-sky-200">
                        You
                      </span>
                    )}
                    {!m.is_active && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {m.email}
                    {m._count.assigned_leads > 0 && ` · ${m._count.assigned_leads} lead${m._count.assigned_leads !== 1 ? "s" : ""}`}
                  </p>
                </div>
                {/* Actions — every member except yourself */}
                {isSelf ? (
                  <div className="shrink-0">
                    <ShieldCheck className="w-4 h-4 text-sky-400" aria-label="You" />
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => { setRoleTarget(m); setNewRole(m.role) }}
                      className="flex items-center gap-1 text-[11px] font-semibold text-slate-500
                                 border border-slate-200 rounded-full px-2.5 py-1 hover:border-sky-300
                                 hover:text-sky-600 hover:bg-sky-50 transition-all duration-150"
                      title="Change role"
                    >
                      <UserCog className="w-3 h-3" />
                      Role
                    </button>
                    <button
                      onClick={() => setWsTarget(m)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-slate-500
                                 border border-slate-200 rounded-full px-2.5 py-1 hover:border-violet-300
                                 hover:text-violet-600 hover:bg-violet-50 transition-all duration-150"
                      title="Manage workspace access"
                    >
                      <Layers className="w-3 h-3" />
                      Access
                    </button>
                    {m.is_active && (
                      <button
                        onClick={() => { setDeactivateTarget(m); setReassignTo("") }}
                        className="flex items-center gap-1 text-[11px] font-semibold text-slate-400
                                   border border-slate-200 rounded-full px-2.5 py-1 hover:border-amber-300
                                   hover:text-amber-600 hover:bg-amber-50 transition-all duration-150"
                        title="Deactivate"
                      >
                        <X className="w-3 h-3" />
                        Off
                      </button>
                    )}
                    <button
                      onClick={() => setRemoveTarget(m)}
                      className="flex items-center justify-center text-slate-400
                                 border border-slate-200 rounded-full w-7 h-7 hover:border-red-300
                                 hover:text-red-600 hover:bg-red-50 transition-all duration-150"
                      title="Remove permanently"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Deactivate modal ─────────────────────────────────────────────── */}
      {deactivateTarget && (
        <ModalPortal>
        <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 p-6 w-full max-w-sm space-y-4
                          shadow-[0_24px_48px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-bold text-slate-900">Deactivate {deactivateTarget.first_name}?</h2>
              <button onClick={() => setDeactivateTarget(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400
                           hover:text-slate-700 hover:bg-slate-100 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[13px] text-slate-500">
              This member has{" "}
              <span className="font-semibold text-slate-800">{deactivateTarget._count.assigned_leads}</span>{" "}
              active lead{deactivateTarget._count.assigned_leads !== 1 ? "s" : ""}.
              {(deactivateTarget._count.assigned_leads ?? 0) > 0
                ? " Reassign them before deactivating."
                : " No leads to reassign."}
            </p>
            {(deactivateTarget._count.assigned_leads ?? 0) > 0 && (
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider">
                  Reassign leads to
                </label>
                <ThemedSelect
                  value={reassignTo}
                  onValueChange={setReassignTo}
                  options={activeReps.filter((r) => r.id !== deactivateTarget.id).map((r) => ({ value: r.id, label: `${r.first_name} ${r.last_name ?? ""}`.trim() }))}
                  placeholder="Select a rep…"
                  aria-label="Reassign leads to"
                />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setDeactivateTarget(null)}
                className="flex-1 h-10 rounded-full border border-slate-200 text-[13px] font-semibold
                           text-slate-600 hover:bg-slate-50 transition-all">
                Cancel
              </button>
              <button
                onClick={handleDeactivate}
                disabled={deactivating || ((deactivateTarget._count.assigned_leads ?? 0) > 0 && !reassignTo)}
                className="flex-1 h-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white
                           text-[13px] font-semibold transition-all disabled:opacity-50">
                {deactivating ? "Deactivating…" : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* ── Role change modal ────────────────────────────────────────────── */}
      {roleTarget && (
        <ModalPortal>
        <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 p-6 w-full max-w-sm space-y-4
                          shadow-[0_24px_48px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-bold text-slate-900">Change Role</h2>
              <button onClick={() => setRoleTarget(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400
                           hover:text-slate-700 hover:bg-slate-100 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[13px] text-slate-500">
              Update role for <span className="font-semibold text-slate-800">{roleTarget.first_name} {roleTarget.last_name}</span>
            </p>
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider">New Role</label>
              <ThemedSelect
                value={newRole}
                onValueChange={(v) => setNewRole(v as Role)}
                options={ROLE_OPTIONS}
                aria-label="New role"
              />
              {newRole === "ADMIN" && (
                <p className="text-[11px] text-amber-600">Admins can manage the whole account, all workspaces, and team access.</p>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setRoleTarget(null)}
                className="flex-1 h-10 rounded-full border border-slate-200 text-[13px] font-semibold
                           text-slate-600 hover:bg-slate-50 transition-all">
                Cancel
              </button>
              <button onClick={handleRoleChange} disabled={roleSaving || newRole === roleTarget.role}
                className="flex-1 h-10 rounded-full bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)] text-white
                           text-[13px] font-semibold transition-all disabled:opacity-50">
                {roleSaving ? "Saving…" : "Save Role"}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* ── Workspace access modal ───────────────────────────────────────── */}
      {wsTarget && (
        <WorkspaceAccessModal member={wsTarget} onClose={() => setWsTarget(null)} />
      )}

      {/* ── Remove (permanent) modal ─────────────────────────────────────── */}
      {removeTarget && (
        <ModalPortal>
        <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-slate-200 p-6 w-full max-w-sm space-y-4
                          shadow-[0_24px_48px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-bold text-slate-900">Remove {removeTarget.first_name}?</h2>
              <button onClick={() => setRemoveTarget(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400
                           hover:text-slate-700 hover:bg-slate-100 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[13px] text-slate-500">
              This <span className="font-semibold text-red-600">permanently removes</span> {removeTarget.first_name} —
              their login is revoked and they're removed from every workspace. This can't be undone.
            </p>
            <p className="text-[12px] text-slate-400">
              Only members with no recorded activity (assigned leads, notes, signals, or won deals) can be permanently
              removed. For anyone with history, use <span className="font-semibold text-slate-600">Off</span> to deactivate instead — it preserves their record.
            </p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setRemoveTarget(null)}
                className="flex-1 h-10 rounded-full border border-slate-200 text-[13px] font-semibold
                           text-slate-600 hover:bg-slate-50 transition-all">
                Cancel
              </button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="flex-1 h-10 rounded-full bg-red-600 hover:bg-red-700 text-white
                           text-[13px] font-semibold transition-all disabled:opacity-50">
                {removing ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

    </div>
  )
}

// ── Page header ──────────────────────────────────────────────────────────────
function Header() {
  return (
    <div className="flex items-start gap-3">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_18px_rgba(14,165,233,0.32)]">
        <Users className="w-6 h-6 text-white" strokeWidth={2.4} />
      </div>
      <div>
        <h1 className="text-[28px] font-bold text-ink tracking-[-0.02em] leading-tight">Team</h1>
        <p className="text-[13px] text-slate-500 mt-0.5">Invite members, manage roles &amp; workspace access, reassign leads.</p>
      </div>
    </div>
  )
}

// ── Workspace access modal ────────────────────────────────────────────────────
interface WorkspaceAccess { id: string; name: string; is_default: boolean; member: boolean }

function WorkspaceAccessModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery<{ workspaces: WorkspaceAccess[]; role: string }>({
    queryKey: ["member-workspaces", member.id],
    queryFn:  async () => {
      const res = await fetch(`/api/team/members/${member.id}/workspaces`)
      if (!res.ok) throw new Error("Failed to load workspace access")
      return res.json()
    },
  })
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = () => qc.invalidateQueries({ queryKey: ["member-workspaces", member.id] })

  async function toggle(ws: WorkspaceAccess) {
    setBusy(ws.id)
    const res = ws.member
      ? await fetch(`/api/team/members/${member.id}/workspaces?workspace_id=${ws.id}`, { method: "DELETE" })
      : await fetch(`/api/team/members/${member.id}/workspaces`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace_id: ws.id }),
        })
    setBusy(null)
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j.error ?? "Failed to update access"); return }
    refresh()
  }

  const workspaces = data?.workspaces ?? []
  const isAdminMember = member.role === "ADMIN"

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 space-y-4 shadow-[0_24px_48px_rgba(15,23,42,0.18)] max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between shrink-0">
            <div className="min-w-0">
              <p className="text-[16px] font-bold text-slate-900 truncate">Workspace access</p>
              <p className="text-[12px] text-slate-500 truncate">{member.first_name} {member.last_name}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-colors shrink-0"><X className="w-4 h-4" /></button>
          </div>

          {isAdminMember && (
            <div className="shrink-0 flex items-start gap-2 rounded-xl bg-sky-50 border border-sky-100 px-3 py-2.5">
              <ShieldCheck className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
              <p className="text-[12px] text-sky-700">Admins can access every workspace automatically. These toggles only affect managers and reps.</p>
            </div>
          )}

          <div className="space-y-1.5 overflow-y-auto">
            {isLoading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)
            ) : isError ? (
              <p className="text-[13px] text-red-500 text-center py-6">Couldn&apos;t load workspace access. Close and try again.</p>
            ) : workspaces.length === 0 ? (
              <p className="text-[13px] text-slate-400 text-center py-6">No workspaces yet.</p>
            ) : (
              workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => toggle(ws)}
                  disabled={busy === ws.id}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left disabled:opacity-50
                    ${ws.member ? "border-sky-200 bg-sky-50/60" : "border-slate-200 hover:bg-slate-50"}`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${ws.member ? "bg-sky-100" : "bg-slate-100"}`}>
                    <Layers className={`w-4 h-4 ${ws.member ? "text-sky-600" : "text-slate-400"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-slate-800 truncate">{ws.name}</p>
                    {ws.is_default && <p className="text-[11px] text-amber-600">Default workspace</p>}
                  </div>
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border
                    ${ws.member ? "bg-sky-500 border-sky-500" : "border-slate-300"}`}>
                    {ws.member && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                </button>
              ))
            )}
          </div>

          <button onClick={onClose} className="shrink-0 h-10 rounded-full border border-slate-200 text-[13px] font-semibold text-slate-600 hover:bg-slate-50 transition-all inline-flex items-center justify-center gap-1.5">
            <Check className="w-4 h-4" /> Done
          </button>
        </div>
      </div>
    </ModalPortal>
  )
}
