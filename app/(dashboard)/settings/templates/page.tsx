"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { ModalPortal } from "@/components/shared/ModalPortal"
import { FileText, Phone, MessageSquare, Plus, X, Eye, Pencil, Trash2, Zap } from "lucide-react"

// ── Constants ─────────────────────────────────────────────────────────────────

const MERGE_FIELDS = [
  { token: "{{first_name}}", label: "First Name" },
  { token: "{{company}}",    label: "Company" },
  { token: "{{grade}}",      label: "Grade" },
  { token: "{{stage}}",      label: "Stage" },
  { token: "{{rep_name}}",   label: "Rep Name" },
]

const SAMPLE_LEAD = {
  first_name: "Rahul",
  company:    "Acme Pvt Ltd",
  grade:      "A",
  stage:      "Negotiation",
  rep_name:   "Priya Sharma",
}

function applyMergeFields(body: string): string {
  let result = body
  for (const [token, value] of Object.entries({
    "{{first_name}}": SAMPLE_LEAD.first_name,
    "{{company}}":    SAMPLE_LEAD.company,
    "{{grade}}":      SAMPLE_LEAD.grade,
    "{{stage}}":      SAMPLE_LEAD.stage,
    "{{rep_name}}":   SAMPLE_LEAD.rep_name,
  })) {
    result = result.replaceAll(token, value)
  }
  return result
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Template {
  id:          string
  name:        string
  type:        "WHATSAPP" | "CALL_SCRIPT"
  body:        string
  stages:      string[]
  grades:      string[]
  usage_count: number
  is_active:   boolean
}

interface TemplatesResponse {
  templates: Template[]
}

async function fetchTemplates(): Promise<TemplatesResponse> {
  const res = await fetch("/api/templates")
  if (!res.ok) throw new Error("Failed to fetch templates")
  // API returns { templates } directly via apiSuccess({templates}) — accept both shapes
  return res.json().then((r) => r?.templates ? r : (r?.data ?? { templates: [] }))
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; bg: string; text: string }> = {
  WHATSAPP: {
    label: "WhatsApp",
    icon:  <MessageSquare className="w-3 h-3" />,
    bg:    "bg-green-100",
    text:  "text-green-700",
  },
  CALL_SCRIPT: {
    label: "Call Script",
    icon:  <Phone className="w-3 h-3" />,
    bg:    "bg-sky-100",
    text:  "text-sky-700",
  },
}

// ── Modals ────────────────────────────────────────────────────────────────────

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm">
        {children}
      </div>
    </ModalPortal>
  )
}

function EditModal({
  template,
  onClose,
}: {
  template: Template | null   // null = create
  onClose:  () => void
}) {
  const qc = useQueryClient()
  const [name,        setName]        = useState(template?.name ?? "")
  const [type,        setType]        = useState<"WHATSAPP" | "CALL_SCRIPT">(template?.type ?? "WHATSAPP")
  const [body,        setBody]        = useState(template?.body ?? "")
  const [stageInput,  setStageInput]  = useState(template?.stages.join(", ") ?? "")
  const [gradeInput,  setGradeInput]  = useState(template?.grades.join(", ") ?? "")
  const [saving,      setSaving]      = useState(false)

  async function handleSave() {
    if (!name.trim() || !body.trim()) return
    setSaving(true)
    try {
      const stages  = stageInput.split(",").map((s) => s.trim()).filter(Boolean)
      const grades  = gradeInput.split(",").map((s) => s.trim()).filter(Boolean)
      const payload = { name, type, body, stages, grades }
      const res = template
        ? await fetch(`/api/templates/${template.id}`, {
            method:  "PATCH",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(payload),
          })
        : await fetch("/api/templates", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(payload),
          })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Save failed")
      toast.success(template ? "Template updated" : "Template created")
      qc.invalidateQueries({ queryKey: ["templates"] })
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Overlay>
      <div className="w-full max-w-lg bg-white rounded-xl shadow-[0_16px_48px_rgba(15,23,42,0.18)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-[16px] font-bold text-slate-900">
            {template ? "Edit Template" : "New Template"}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Name */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Name</p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. WhatsApp Follow-up Day 1"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-900
                         placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/30
                         focus:border-sky-400 transition-all"
            />
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Type</p>
            <div className="flex gap-2">
              {(["WHATSAPP", "CALL_SCRIPT"] as const).map((t) => {
                const cfg    = TYPE_CONFIG[t]
                const active = type === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-xl border text-[13px] font-semibold transition-all ${
                      active
                        ? "bg-sky-600 border-sky-600 text-white"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {cfg.icon}
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Message Body</p>
              <div className="flex gap-1 flex-wrap justify-end">
                {MERGE_FIELDS.map((f) => (
                  <button
                    key={f.token}
                    type="button"
                    onClick={() => setBody((b) => b + f.token)}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 border border-sky-100
                               text-sky-600 hover:bg-sky-100 transition-colors"
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={"Hi {{first_name}}, following up about…"}
              rows={5}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-900
                         placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/30
                         focus:border-sky-400 transition-all resize-none"
            />
            <p className="text-[11px] text-slate-400">{body.length} / 2000 characters</p>
          </div>

          {/* Inline preview */}
          {body && (
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Preview</p>
              <p className="text-[13px] text-slate-700 whitespace-pre-wrap leading-relaxed">
                {applyMergeFields(body)}
              </p>
            </div>
          )}

          {/* Stages */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Stages</p>
            <input
              type="text"
              value={stageInput}
              onChange={(e) => setStageInput(e.target.value)}
              placeholder="Negotiation, Follow-up"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-900
                         placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/30
                         focus:border-sky-400 transition-all"
            />
            <p className="text-[11px] text-slate-400">Comma-separated — suggest this template in these pipeline stages</p>
          </div>

          {/* Grades */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Grades (optional)</p>
            <input
              type="text"
              value={gradeInput}
              onChange={(e) => setGradeInput(e.target.value)}
              placeholder="A, B"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-900
                         placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/30
                         focus:border-sky-400 transition-all"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-full border border-slate-200 text-[13px] font-semibold text-slate-600
                       hover:bg-slate-50 hover:border-slate-300 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !body.trim()}
            className="h-9 px-5 rounded-full bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)] text-white text-[13px] font-semibold
                       disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] transition-all
                       shadow-[0_1px_2px_rgba(14, 165, 233,0.25),inset_0_1px_0_rgba(255,255,255,0.12)]"
          >
            {saving ? "Saving…" : template ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

function PreviewModal({ template, onClose }: { template: Template; onClose: () => void }) {
  const cfg = TYPE_CONFIG[template.type]
  return (
    <Overlay>
      <div className="w-full max-w-md bg-white rounded-xl shadow-[0_16px_48px_rgba(15,23,42,0.18)] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center ${cfg.bg} ${cfg.text}`}>
              {cfg.icon}
            </div>
            <div>
              <h2 className="text-[16px] font-bold text-slate-900">{template.name}</h2>
              <p className="text-[11px] text-slate-400">{cfg.label} · {template.usage_count} uses</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Preview with sample data</p>
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
              <p className="text-[13px] text-slate-700 whitespace-pre-wrap leading-relaxed">
                {applyMergeFields(template.body)}
              </p>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {[
              `Name: ${SAMPLE_LEAD.first_name}`,
              `Co: ${SAMPLE_LEAD.company}`,
              `Grade: ${SAMPLE_LEAD.grade}`,
              `Stage: ${SAMPLE_LEAD.stage}`,
            ].map((s) => (
              <span key={s} className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{s}</span>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="h-9 px-5 rounded-full bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)] text-white text-[13px] font-semibold transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </Overlay>
  )
}

function DeleteModal({ template, onClose }: { template: Template; onClose: () => void }) {
  const qc      = useQueryClient()
  const [busy, setBusy] = useState(false)

  async function handleDelete() {
    setBusy(true)
    const res = await fetch(`/api/templates/${template.id}`, { method: "DELETE" })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? "Delete failed")
      setBusy(false)
      return
    }
    toast.success("Template deleted")
    qc.invalidateQueries({ queryKey: ["templates"] })
    onClose()
  }

  return (
    <Overlay>
      <div className="w-full max-w-sm bg-white rounded-xl shadow-[0_16px_48px_rgba(15,23,42,0.18)] overflow-hidden">
        <div className="px-6 pt-6 pb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <h2 className="text-[16px] font-bold text-slate-900">Delete template?</h2>
          <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">
            &ldquo;{template.name}&rdquo; will be permanently removed. This cannot be undone.
          </p>
        </div>
        <div className="flex gap-2 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-full border border-slate-200 text-[13px] font-semibold text-slate-600 hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={busy}
            className="flex-1 h-10 rounded-full bg-red-600 hover:bg-red-700 text-white text-[13px] font-semibold disabled:opacity-50 transition-all"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

// ── Template Card ─────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onEdit,
  onPreview,
  onDelete,
}: {
  template: Template
  onEdit:   (t: Template) => void
  onPreview:(t: Template) => void
  onDelete: (t: Template) => void
}) {
  const cfg = TYPE_CONFIG[template.type]

  return (
    <div className="glass-card p-4 hover:-translate-y-[1px] transition-all duration-200">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg} ${cfg.text}`}>
          {template.type === "WHATSAPP"
            ? <MessageSquare className="w-4 h-4" />
            : <Phone className="w-4 h-4" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-bold text-slate-900 truncate">{template.name}</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
              {cfg.label}
            </span>
          </div>

          <p className="text-[12px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">{template.body}</p>

          <div className="flex items-center gap-3 mt-2">
            {template.stages.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {template.stages.map((s) => (
                  <span key={s} className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {s}
                  </span>
                ))}
              </div>
            )}
            <span className="text-[11px] text-slate-400 ml-auto shrink-0">
              {template.usage_count} use{template.usage_count !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100">
        <button
          onClick={() => onPreview(template)}
          className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-full border border-slate-200
                     text-[12px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-50 hover:border-slate-300 transition-all"
        >
          <Eye className="w-3.5 h-3.5" />
          Preview
        </button>
        <button
          onClick={() => onEdit(template)}
          className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-full bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]
                     text-white text-[12px] font-semibold transition-all
                     shadow-[0_1px_2px_rgba(14, 165, 233,0.25),inset_0_1px_0_rgba(255,255,255,0.12)]"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
        <button
          onClick={() => onDelete(template)}
          className="w-8 h-8 rounded-full flex items-center justify-center border border-slate-200
                     text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const { data, isLoading } = useQuery<TemplatesResponse>({
    queryKey: ["templates"],
    queryFn:  fetchTemplates,
  })

  const [filter,        setFilter]        = useState<string>("all")
  const [editTarget,    setEditTarget]    = useState<Template | null | "create">(null)
  const [deleteTarget,  setDeleteTarget]  = useState<Template | null>(null)
  const [previewTarget, setPreviewTarget] = useState<Template | null>(null)

  const allTemplates = data?.templates ?? []
  const templates    = allTemplates.filter((t) => filter === "all" || t.type === filter)
  const atLimit      = allTemplates.length >= 20

  const FILTERS = [
    { key: "all",         label: "All",         count: allTemplates.length },
    { key: "WHATSAPP",    label: "WhatsApp",     count: allTemplates.filter((t) => t.type === "WHATSAPP").length },
    { key: "CALL_SCRIPT", label: "Call Scripts", count: allTemplates.filter((t) => t.type === "CALL_SCRIPT").length },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_18px_rgba(14,165,233,0.32)]">
            <MessageSquare className="w-6 h-6 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <h1 className="text-[28px] font-bold text-ink tracking-[-0.02em] leading-tight">Smart Templates</h1>
            <p className="text-[13px] text-slate-500 mt-0.5">
              {allTemplates.length} / 20 templates used.
            </p>
          </div>
        </div>
        <button
          onClick={() => setEditTarget("create")}
          disabled={atLimit}
          className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)] text-white
                     text-[13px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed
                     active:scale-[0.97] transition-all
                     shadow-[0_1px_2px_rgba(14, 165, 233,0.25),inset_0_1px_0_rgba(255,255,255,0.12)]"
        >
          <Plus className="w-4 h-4" />
          New Template
        </button>
      </div>

      {/* ── Filter chips ─────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-semibold border transition-all ${
              filter === f.key
                ? "bg-sky-600 border-sky-600 text-white"
                : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }`}
          >
            {f.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              filter === f.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
            }`}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Loading ──────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
        </div>
      )}

      {/* ── Empty ────────────────────────────────────────────────────── */}
      {!isLoading && templates.length === 0 && (
        <div className="glass-card px-6 py-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-6 h-6 text-sky-600" />
          </div>
          <p className="text-[16px] font-semibold text-slate-900">No templates yet</p>
          <p className="text-[12px] text-slate-400 mt-1.5 max-w-[200px] mx-auto leading-relaxed">
            Create reusable WhatsApp messages and call scripts.
          </p>
          <button
            onClick={() => setEditTarget("create")}
            className="mt-4 h-9 px-4 rounded-full bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)] text-white text-[13px] font-semibold transition-all"
          >
            Create first template
          </button>
        </div>
      )}

      {/* ── Template grid ────────────────────────────────────────────── */}
      {!isLoading && templates.length > 0 && (
        <>
          {/* WhatsApp group */}
          {(filter === "all" || filter === "WHATSAPP") && templates.filter((t) => t.type === "WHATSAPP").length > 0 && (
            <div className="space-y-3">
              {filter === "all" && (
                <p className="section-label flex items-center gap-1.5">
                  <MessageSquare className="w-3 h-3 text-green-600" />
                  WhatsApp · {templates.filter((t) => t.type === "WHATSAPP").length}
                </p>
              )}
              {templates
                .filter((t) => t.type === "WHATSAPP")
                .map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onEdit={setEditTarget}
                    onPreview={setPreviewTarget}
                    onDelete={setDeleteTarget}
                  />
                ))}
            </div>
          )}

          {/* Call Script group */}
          {(filter === "all" || filter === "CALL_SCRIPT") && templates.filter((t) => t.type === "CALL_SCRIPT").length > 0 && (
            <div className="space-y-3">
              {filter === "all" && (
                <p className="section-label flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-sky-600" />
                  Call Scripts · {templates.filter((t) => t.type === "CALL_SCRIPT").length}
                </p>
              )}
              {templates
                .filter((t) => t.type === "CALL_SCRIPT")
                .map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onEdit={setEditTarget}
                    onPreview={setPreviewTarget}
                    onDelete={setDeleteTarget}
                  />
                ))}
            </div>
          )}
        </>
      )}

      {/* ── Merge field guide ────────────────────────────────────────── */}
      {!isLoading && allTemplates.length > 0 && (
        <div className="glass-card px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-3.5 h-3.5 text-sky-600" />
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Merge Fields</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {MERGE_FIELDS.map((f) => (
              <code key={f.token} className="text-[11px] bg-sky-50 border border-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-mono">
                {f.token}
              </code>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">These tokens are auto-replaced with real lead data when templates are used.</p>
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────── */}
      {editTarget !== null && (
        <EditModal
          template={editTarget === "create" ? null : editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}
      {previewTarget && (
        <PreviewModal template={previewTarget} onClose={() => setPreviewTarget(null)} />
      )}
      {deleteTarget && (
        <DeleteModal template={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}

    </div>
  )
}
