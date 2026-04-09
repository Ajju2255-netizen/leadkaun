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
import { Textarea } from "@/components/ui/textarea"

const MERGE_FIELDS = [
  { token: "{{first_name}}", label: "First Name" },
  { token: "{{company}}", label: "Company" },
  { token: "{{grade}}", label: "Grade" },
  { token: "{{stage}}", label: "Stage" },
  { token: "{{rep_name}}", label: "Rep Name" },
]

const SAMPLE_LEAD = {
  first_name: "Rahul",
  company: "Acme Pvt Ltd",
  grade: "A",
  stage: "Negotiation",
  rep_name: "Priya Sharma",
}

function applyMergeFields(body: string): string {
  let result = body
  for (const [token, value] of Object.entries({
    "{{first_name}}": SAMPLE_LEAD.first_name,
    "{{company}}": SAMPLE_LEAD.company,
    "{{grade}}": SAMPLE_LEAD.grade,
    "{{stage}}": SAMPLE_LEAD.stage,
    "{{rep_name}}": SAMPLE_LEAD.rep_name,
  })) {
    result = result.replaceAll(token, value)
  }
  return result
}

interface Template {
  id: string
  name: string
  type: "WHATSAPP" | "CALL_SCRIPT"
  body: string
  stages: string[]
  grades: string[]
  usage_count: number
  is_active: boolean
}

interface TemplatesResponse {
  templates: Template[]
}

async function fetchTemplates(): Promise<TemplatesResponse> {
  const res = await fetch("/api/templates")
  if (!res.ok) throw new Error("Failed to fetch templates")
  return res.json().then((r) => r.data)
}

const TYPE_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  CALL_SCRIPT: "Call Script",
}

const TYPE_COLORS: Record<string, string> = {
  WHATSAPP: "bg-green-100 text-green-800",
  CALL_SCRIPT: "bg-blue-100 text-blue-800",
}

export default function TemplatesPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<TemplatesResponse>({
    queryKey: ["templates"],
    queryFn: fetchTemplates,
  })

  const [filter, setFilter] = useState<string>("all")
  const [editTarget, setEditTarget] = useState<Template | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null)
  const [previewTarget, setPreviewTarget] = useState<Template | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [name, setName] = useState("")
  const [type, setType] = useState<"WHATSAPP" | "CALL_SCRIPT">("WHATSAPP")
  const [body, setBody] = useState("")
  const [stageInput, setStageInput] = useState("")
  const [gradeInput, setGradeInput] = useState("")

  function openCreate() {
    setName(""); setType("WHATSAPP"); setBody(""); setStageInput(""); setGradeInput("")
    setCreateOpen(true)
  }

  function openEdit(t: Template) {
    setName(t.name); setType(t.type); setBody(t.body)
    setStageInput(t.stages.join(", ")); setGradeInput(t.grades.join(", "))
    setEditTarget(t)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const stages = stageInput.split(",").map((s) => s.trim()).filter(Boolean)
      const grades = gradeInput.split(",").map((s) => s.trim()).filter(Boolean)
      const payload = { name, type, body, stages, grades }
      let res: Response
      if (editTarget) {
        res = await fetch(`/api/templates/${editTarget.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Save failed")
      setEditTarget(null); setCreateOpen(false)
      qc.invalidateQueries({ queryKey: ["templates"] })
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const res = await fetch(`/api/templates/${deleteTarget.id}`, { method: "DELETE" })
    if (!res.ok) { const j = await res.json(); alert(j.error ?? "Delete failed"); return }
    setDeleteTarget(null)
    qc.invalidateQueries({ queryKey: ["templates"] })
  }

  const templates = (data?.templates ?? []).filter(
    (t) => filter === "all" || t.type === filter,
  )

  const isOpen = createOpen || !!editTarget

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Smart Templates</h1>
          <p className="text-muted-foreground mt-1">
            {data?.templates.length ?? 0} / 20 templates used
          </p>
        </div>
        <Button onClick={openCreate} disabled={(data?.templates.length ?? 0) >= 20}>
          + New Template
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 border-b pb-0">
        {["all", "WHATSAPP", "CALL_SCRIPT"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              filter === f
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "all" ? "All" : TYPE_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Template Grid */}
      {isLoading ? (
        <div className="grid gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="border rounded-lg p-10 text-center text-muted-foreground">
          No templates yet.{" "}
          <button className="underline text-foreground" onClick={openCreate}>
            Create your first template.
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {templates.map((t) => (
            <div key={t.id} className="border rounded-lg p-4 flex gap-4 items-start">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{t.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[t.type]}`}>
                    {TYPE_LABELS[t.type]}
                  </span>
                  {t.stages.map((stage) => (
                    <Badge key={stage} variant="secondary" className="text-xs">
                      {stage}
                    </Badge>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{t.body}</p>
                <p className="text-xs text-muted-foreground">Used {t.usage_count} times</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => setPreviewTarget(t)}>
                  Preview
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setDeleteTarget(t)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditTarget(null) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Template" : "New Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. WhatsApp Follow-up Day 1" />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType((v ?? "WHATSAPP") as typeof type)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                  <SelectItem value="CALL_SCRIPT">Call Script</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>Body</Label>
                <div className="flex gap-1 flex-wrap">
                  {MERGE_FIELDS.map((f) => (
                    <button
                      key={f.token}
                      type="button"
                      className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-muted/70 border"
                      onClick={() => setBody((b) => b + f.token)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Hi {{first_name}}, following up about…"
                rows={5}
              />
              <p className="text-xs text-muted-foreground">{body.length} / 2000 characters</p>
            </div>
            {body && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Preview (with sample data)</Label>
                <div className="bg-muted rounded-md p-3 text-sm whitespace-pre-wrap">
                  {applyMergeFields(body)}
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label>Stages (comma-separated)</Label>
              <Input value={stageInput} onChange={(e) => setStageInput(e.target.value)} placeholder="Negotiation, Follow-up" />
              <p className="text-xs text-muted-foreground">
                Suggest this template when the lead is in one of these stages.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Grades (comma-separated, optional)</Label>
              <Input value={gradeInput} onChange={(e) => setGradeInput(e.target.value)} placeholder="A, B" />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setCreateOpen(false); setEditTarget(null) }}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !name || !body}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewTarget} onOpenChange={(open) => !open && setPreviewTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{previewTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-xs text-muted-foreground">Preview with sample lead data</p>
            <div className="bg-muted rounded-md p-4 text-sm whitespace-pre-wrap">
              {previewTarget ? applyMergeFields(previewTarget.body) : ""}
            </div>
            <div className="flex gap-2 flex-wrap text-xs text-muted-foreground">
              <span>Sample:</span>
              <span>Name: {SAMPLE_LEAD.first_name}</span>
              <span>Company: {SAMPLE_LEAD.company}</span>
              <span>Grade: {SAMPLE_LEAD.grade}</span>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setPreviewTarget(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &quot;{deleteTarget?.name}&quot;?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
