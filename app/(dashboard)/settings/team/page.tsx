"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

interface Member {
  id: string
  email: string
  first_name: string
  last_name: string
  role: "ADMIN" | "MANAGER" | "REP"
  is_active: boolean
  _count: { assigned_leads: number }
}

interface MembersResponse {
  members: Member[]
}

async function fetchMembers(): Promise<MembersResponse> {
  const res = await fetch("/api/team/members")
  if (!res.ok) throw new Error("Failed to fetch members")
  return res.json().then((r) => r.data)
}

export default function TeamPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<MembersResponse>({
    queryKey: ["team-members"],
    queryFn: fetchMembers,
  })

  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"REP" | "MANAGER">("REP")
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteMsg, setInviteMsg] = useState("")

  // Deactivate dialog
  const [deactivateTarget, setDeactivateTarget] = useState<Member | null>(null)
  const [reassignTo, setReassignTo] = useState("")

  // Role change dialog
  const [roleTarget, setRoleTarget] = useState<Member | null>(null)
  const [newRole, setNewRole] = useState<"REP" | "MANAGER">("REP")

  const activeReps = (data?.members ?? []).filter((m) => m.is_active && m.role === "REP")

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteLoading(true)
    setInviteMsg("")
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Invite failed")
      setInviteMsg(`Invite sent to ${inviteEmail}`)
      setInviteEmail("")
      qc.invalidateQueries({ queryKey: ["team-members"] })
    } catch (err: unknown) {
      setInviteMsg(err instanceof Error ? err.message : "Invite failed")
    } finally {
      setInviteLoading(false)
    }
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return
    const body: Record<string, unknown> = { is_active: false }
    if (reassignTo) body.reassign_to_rep_id = reassignTo
    const res = await fetch(`/api/team/members/${deactivateTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) {
      alert(json.error ?? "Failed to deactivate")
      return
    }
    setDeactivateTarget(null)
    setReassignTo("")
    qc.invalidateQueries({ queryKey: ["team-members"] })
  }

  async function handleRoleChange() {
    if (!roleTarget) return
    const res = await fetch(`/api/team/members/${roleTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    })
    if (!res.ok) {
      const json = await res.json()
      alert(json.error ?? "Failed to update role")
      return
    }
    setRoleTarget(null)
    qc.invalidateQueries({ queryKey: ["team-members"] })
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Team Management</h1>
        <p className="text-muted-foreground mt-1">Invite members, manage roles, and reassign leads.</p>
      </div>

      {/* Invite Form */}
      <div className="border rounded-lg p-6 space-y-4">
        <h2 className="text-base font-semibold">Invite a Team Member</h2>
        <form onSubmit={handleInvite} className="flex gap-3 items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="rep@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
          </div>
          <div className="w-36 space-y-1">
            <Label>Role</Label>
            <Select value={inviteRole} onValueChange={(v) => setInviteRole((v ?? "REP") as "REP" | "MANAGER")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="REP">Rep</SelectItem>
                <SelectItem value="MANAGER">Manager</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={inviteLoading}>
            {inviteLoading ? "Sending…" : "Send Invite"}
          </Button>
        </form>
        {inviteMsg && (
          <p className={inviteMsg.includes("sent") ? "text-green-600 text-sm" : "text-destructive text-sm"}>
            {inviteMsg}
          </p>
        )}
      </div>

      {/* Members Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Member</th>
              <th className="px-4 py-3 text-left font-medium">Role</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Active Leads</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3" colSpan={5}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              : (data?.members ?? []).map((m) => (
                  <tr key={m.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {m.first_name} {m.last_name}
                      </div>
                      <div className="text-muted-foreground text-xs">{m.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="capitalize">
                        {m.role.toLowerCase()}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={m.is_active ? "default" : "secondary"}>
                        {m.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{m._count.assigned_leads}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {m.role !== "ADMIN" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRoleTarget(m)
                            setNewRole(m.role === "REP" ? "MANAGER" : "REP")
                          }}
                        >
                          Change Role
                        </Button>
                      )}
                      {m.is_active && m.role !== "ADMIN" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => {
                            setDeactivateTarget(m)
                            setReassignTo("")
                          }}
                        >
                          Deactivate
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Deactivate Dialog */}
      <Dialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate {deactivateTarget?.first_name}?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              This member has{" "}
              <span className="font-semibold text-foreground">{deactivateTarget?._count.assigned_leads}</span> active
              leads.
              {(deactivateTarget?._count.assigned_leads ?? 0) > 0
                ? " Select a rep to reassign them before deactivating."
                : " No leads to reassign."}
            </p>
            {(deactivateTarget?._count.assigned_leads ?? 0) > 0 && (
              <div className="space-y-1">
                <Label>Reassign leads to</Label>
                <Select
                  value={reassignTo}
                  onValueChange={(v) => setReassignTo(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a rep…" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeReps
                      .filter((r) => r.id !== deactivateTarget?.id)
                      .map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.first_name} {r.last_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={(deactivateTarget?._count.assigned_leads ?? 0) > 0 && !reassignTo}
              onClick={handleDeactivate}
            >
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Change Dialog */}
      <Dialog open={!!roleTarget} onOpenChange={(open) => !open && setRoleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role for {roleTarget?.first_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>New Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole((v ?? "REP") as "REP" | "MANAGER")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="REP">Rep</SelectItem>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleRoleChange}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
