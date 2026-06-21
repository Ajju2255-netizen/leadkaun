"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Layers, Plus, Users, Star, Archive, ArchiveRestore, X, Check } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { ThemedSelect } from "@/components/shared/ThemedSelect"
import { ModalPortal } from "@/components/shared/ModalPortal"
import { AvatarCircle } from "@/components/shared/AvatarCircle"

interface Workspace {
  id: string; name: string; slug: string; description: string | null
  is_default: boolean; archived_at: string | null
  member_count: number; lead_count: number
}
interface Member { id: string; first_name: string; last_name: string | null; email: string; role: string }

export default function WorkspacesPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<{ workspaces: Workspace[]; active_id: string | null }>({
    queryKey: ["workspaces"],
    queryFn: () => fetch("/api/workspaces", { credentials: "include" }).then((r) => r.json()),
  })

  const [name, setName] = useState("")
  const [creating, setCreating] = useState(false)
  const [manageId, setManageId] = useState<string | null>(null)

  const refresh = () => qc.invalidateQueries({ queryKey: ["workspaces"] })

  async function createWorkspace() {
    if (!name.trim() || creating) return
    setCreating(true)
    const res = await fetch("/api/workspaces", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    })
    setCreating(false)
    if (res.ok) { toast.success("Workspace created"); setName(""); refresh() }
    else { const e = await res.json().catch(() => ({})); toast.error(e.error ?? "Failed to create workspace") }
  }

  async function patch(id: string, body: Record<string, unknown>, ok: string) {
    const res = await fetch(`/api/workspaces/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (res.ok) { toast.success(ok); refresh() }
    else { const e = await res.json().catch(() => ({})); toast.error(e.error ?? "Failed") }
  }

  const workspaces = data?.workspaces ?? []

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_18px_rgba(14,165,233,0.32)]">
          <Layers className="w-6 h-6 text-white" strokeWidth={2.2} />
        </div>
        <div>
          <h1 className="text-[28px] font-bold text-ink tracking-[-0.02em] leading-tight">Workspaces</h1>
          <p className="text-[13px] text-slate-500 mt-0.5 leading-relaxed">
            Separate lead-intelligence environments — each has its own leads, pipeline, sources, and team. Assign who works in each.
          </p>
        </div>
      </div>

      {/* Create */}
      <div className="glass-card px-5 py-4">
        <label className="text-[12px] font-semibold text-slate-600 block mb-1.5">New workspace</label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createWorkspace()}
            placeholder="e.g. Insurance Team, Bangalore Branch…"
            className="flex-1 h-10 px-3.5 rounded-xl border border-slate-200 bg-white text-[13px] text-ink placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition-all"
          />
          <button
            onClick={createWorkspace}
            disabled={creating || !name.trim()}
            className="h-10 px-4 rounded-xl inline-flex items-center gap-1.5 text-white text-[13px] font-semibold transition-all shrink-0
                       bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600
                       shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)] disabled:opacity-50 active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" /> Create
          </button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : (
        <div className="space-y-2.5">
          {workspaces.map((w) => (
            <div key={w.id} className="glass-card px-5 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5 text-sky-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-bold text-ink truncate">{w.name}</p>
                  {w.is_default && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 ring-1 ring-amber-200 px-1.5 py-0.5 rounded-full"><Star className="w-2.5 h-2.5 fill-current" /> Default</span>}
                  {w.archived_at && <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">Archived</span>}
                </div>
                <p className="text-[12px] text-slate-500 mt-0.5 tabular-nums">{w.member_count} member{w.member_count === 1 ? "" : "s"} · {w.lead_count} lead{w.lead_count === 1 ? "" : "s"}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {!w.is_default && !w.archived_at && (
                  <button onClick={() => patch(w.id, { is_default: true }, "Default workspace updated")}
                    title="Make default"
                    className="h-8 px-2.5 rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
                    Make default
                  </button>
                )}
                <button onClick={() => patch(w.id, { archived: !w.archived_at }, w.archived_at ? "Workspace restored" : "Workspace archived")}
                  title={w.archived_at ? "Restore" : "Archive"}
                  disabled={w.is_default && !w.archived_at}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors">
                  {w.archived_at ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                </button>
                <button onClick={() => setManageId(w.id)}
                  className="h-8 px-3 rounded-lg inline-flex items-center gap-1.5 text-[12px] font-semibold text-sky-700 border border-sky-200 bg-sky-50/60 hover:bg-sky-50 transition-colors">
                  <Users className="w-3.5 h-3.5" /> Members
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {manageId && (
        <MembersModal
          workspace={workspaces.find((w) => w.id === manageId)!}
          onClose={() => setManageId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  )
}

// ── Members modal ───────────────────────────────────────────────────────────

function MembersModal({ workspace, onClose, onChanged }: { workspace: Workspace; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<{ members: Member[]; available: Member[] }>({
    queryKey: ["workspace-members", workspace.id],
    queryFn: () => fetch(`/api/workspaces/${workspace.id}/members`, { credentials: "include" }).then((r) => r.json()),
  })
  const [addId, setAddId] = useState("")
  const refresh = () => { qc.invalidateQueries({ queryKey: ["workspace-members", workspace.id] }); onChanged() }

  async function add(userId: string) {
    if (!userId) return
    const res = await fetch(`/api/workspaces/${workspace.id}/members`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    })
    if (res.ok) { setAddId(""); refresh() } else toast.error("Failed to add member")
  }
  async function remove(userId: string) {
    const res = await fetch(`/api/workspaces/${workspace.id}/members?user_id=${userId}`, { method: "DELETE", credentials: "include" })
    if (res.ok) refresh(); else toast.error("Failed to remove member")
  }

  const name = (m: Member) => `${m.first_name} ${m.last_name ?? ""}`.trim() || m.email

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl glass-3 gloss-edge p-6 space-y-4 shadow-[0_24px_48px_rgba(15,23,42,0.18)] max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between shrink-0">
            <div className="min-w-0">
              <p className="text-[16px] font-bold text-slate-900 truncate">{workspace.name}</p>
              <p className="text-[12px] text-ink-muted">Who works in this workspace</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/70 text-slate-400 transition-colors shrink-0"><X className="w-4 h-4" /></button>
          </div>

          {/* Add */}
          {!isLoading && (data?.available.length ?? 0) > 0 && (
            <div className="flex gap-2 shrink-0">
              <ThemedSelect
                value={addId}
                onValueChange={(v) => { setAddId(v); add(v) }}
                options={(data?.available ?? []).map((m) => ({ value: m.id, label: `${name(m)} · ${m.role.toLowerCase()}` }))}
                placeholder="Add a member…"
                aria-label="Add member"
              />
            </div>
          )}

          {/* Members */}
          <div className="space-y-1.5 overflow-y-auto">
            {isLoading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-full rounded-xl" />)
            ) : (data?.members.length ?? 0) === 0 ? (
              <p className="text-[13px] text-ink-muted text-center py-6">No members yet. Add someone above.</p>
            ) : (
              data?.members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/60 transition-colors">
                  <AvatarCircle seed={name(m)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-ink truncate">{name(m)}</p>
                    <p className="text-[11px] text-ink-muted truncate">{m.email} · {m.role.toLowerCase()}</p>
                  </div>
                  <button onClick={() => remove(m.id)} title="Remove" className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <button onClick={onClose} className="shrink-0 h-10 rounded-full border border-slate-200/70 text-[13px] font-semibold text-slate-600 hover:bg-white/70 transition-all bg-white/40 inline-flex items-center justify-center gap-1.5">
            <Check className="w-4 h-4" /> Done
          </button>
        </div>
      </div>
    </ModalPortal>
  )
}
