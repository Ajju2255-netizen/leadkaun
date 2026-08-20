"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

/**
 * Delete or restore a record from Leadkaun.
 *
 * This is a soft delete: the row and all of its children stay in the database,
 * the customer simply loses access and the record leaves the admin lists. That
 * is why the confirmation is a typed name rather than an "Are you sure?" — the
 * action is reversible, but removing a paying customer from the product should
 * still take a deliberate moment, and a mistyped click on a table row should
 * never be enough.
 *
 * SUPER_ADMIN only; the server enforces it too. `canWrite` here only decides
 * whether the control is usable, never whether the action is permitted.
 */
export function DeleteRecord({
  entity, id, name, deleted, canWrite = false,
}: {
  entity: "account" | "user" | "workspace" | "lead"
  id: string
  /** Shown in the prompt and typed back to confirm a delete. */
  name: string
  deleted: boolean
  canWrite?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function send(action: "delete" | "restore") {
    setBusy(true); setErr(null)
    const res = await fetch("/api/admin/platform/soft-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, id, action }),
    }).catch(() => null)
    setBusy(false)
    if (!res || !res.ok) {
      setErr(res?.status === 403 ? "Requires the SUPER_ADMIN role." : "Could not save. Nothing changed.")
      return
    }
    setOpen(false); setTyped("")
    router.refresh()
  }

  if (deleted) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
          Deleted from Leadkaun
        </span>
        <button
          type="button"
          onClick={() => send("restore")}
          disabled={busy || !canWrite}
          title={canWrite ? undefined : "Requires the SUPER_ADMIN role"}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-sky-300 hover:text-sky-700 disabled:opacity-50"
        >
          {busy ? "Restoring…" : "Restore"}
        </button>
        {err && <span className="text-[12px] text-rose-600">{err}</span>}
      </div>
    )
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!canWrite}
          title={canWrite ? undefined : "Requires the SUPER_ADMIN role"}
          className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50"
        >
          Delete from Leadkaun
        </button>
        {err && <span className="text-[12px] text-rose-600">{err}</span>}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
      <p className="text-[13px] font-semibold text-ink">Delete this {entity} from Leadkaun?</p>
      <p className="mt-1.5 max-w-[62ch] text-[12.5px] leading-[1.6] text-ink-soft">
        Access stops immediately and it disappears from the admin lists. Nothing is erased — every
        row stays in the database and you can restore it from this same screen.
      </p>
      <label className="mt-3 block text-[12px] font-medium text-ink-soft">
        Type <span className="font-mono text-ink">{name}</span> to confirm
      </label>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        className="mt-1.5 h-9 w-full max-w-sm rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-rose-400"
        placeholder={name}
        autoComplete="off"
      />
      <div className="mt-3 flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => send("delete")}
          disabled={busy || typed.trim() !== name.trim()}
          className="rounded-lg bg-rose-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-40"
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setTyped(""); setErr(null) }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink"
        >
          Cancel
        </button>
        {err && <span className="text-[12px] text-rose-600">{err}</span>}
      </div>
    </div>
  )
}
