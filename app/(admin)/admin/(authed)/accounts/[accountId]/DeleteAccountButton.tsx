"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2, AlertTriangle } from "lucide-react"

import { Button, Input } from "../../_components/ui"

/**
 * Permanent account deletion. Mission Control only.
 *
 * There is deliberately no equivalent in the customer app: nobody should be
 * able to destroy their own company's data from a settings page at four in the
 * afternoon. It lives here, behind SUPER_ADMIN, and the server checks that
 * again rather than trusting this component.
 *
 * The typed confirmation is the real safeguard. A second "are you sure" dialog
 * trains people to click twice; typing the account name cannot be done by
 * muscle memory, and it makes you read which account you are on.
 */
export function DeleteAccountButton({
  accountId,
  accountName,
  leadCount,
  userCount,
}: {
  accountId: string
  accountName: string
  leadCount: number
  userCount: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmName, setConfirmName] = useState("")
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const nameMatches = confirmName.trim() === accountName.trim()
  const canDelete = nameMatches && reason.trim().length >= 4 && !loading

  async function destroy() {
    if (!canDelete) return
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch("/api/admin/platform/account-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, confirmName: confirmName.trim(), reason: reason.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        setErr(json.error ?? "Could not delete the account")
        setLoading(false)
        return
      }
      // The account page it was opened from no longer exists.
      router.push("/accounts")
      router.refresh()
    } catch {
      setErr("Network error. The account may or may not have been deleted, so check the list.")
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Trash2 className="w-4 h-4" />
        Delete account
      </Button>
    )
  }

  return (
    <div className="w-[380px] rounded-2xl border border-red-200 bg-red-50/50 px-4 py-3.5">
      <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-red-600">
        <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.4} />
        This cannot be undone
      </p>
      <p className="mt-1.5 text-[11.5px] leading-snug text-ink-soft">
        Deletes <span className="font-semibold text-ink">{leadCount.toLocaleString("en-IN")}</span> leads,{" "}
        <span className="font-semibold text-ink">{userCount}</span> user{userCount === 1 ? "" : "s"} and every
        workspace, note, signal and invoice under this account. Their logins are removed too. There is no backup
        and no undo.
      </p>

      <label className="mt-3 block text-[11px] font-semibold text-ink-soft">
        Type <span className="font-mono text-ink">{accountName}</span> to confirm
      </label>
      <Input
        autoFocus
        value={confirmName}
        onChange={(e) => setConfirmName(e.target.value)}
        placeholder={accountName}
        className="mt-1 w-full"
      />

      <label className="mt-2.5 block text-[11px] font-semibold text-ink-soft">Reason</label>
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Customer asked for their data to be removed"
        className="mt-1 w-full"
      />

      {err && <p role="alert" className="mt-2 text-[11.5px] font-medium text-red-600">{err}</p>}

      <div className="mt-3 flex items-center gap-2">
        <Button variant="danger" size="sm" disabled={!canDelete} onClick={destroy}>
          {loading ? "Deleting…" : "Delete permanently"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => { setOpen(false); setConfirmName(""); setReason(""); setErr(null) }}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
