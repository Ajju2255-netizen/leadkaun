"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { GradeBadge } from "@/components/shared/GradeBadge"
import { CheckCircle2, Upload } from "lucide-react"

const STEPS = [
  { id: 1, title: "Welcome",          required: true  },
  { id: 2, title: "Define Your ICP",  required: false },
  { id: 3, title: "Add Your Leads",   required: false },
  { id: 4, title: "Invite Your Team", required: false },
  { id: 5, title: "SQL Thresholds",   required: true  },
  { id: 6, title: "Review & Launch",  required: true  },
]

// ── Shared input/button primitives ────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[12px] font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  )
}

const inputCls = `w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-[13px]
  text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2
  focus:ring-sky-500/30 focus:border-sky-400 transition-all`

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router       = useRouter()
  const queryClient  = useQueryClient()
  const { data: session } = useCurrentUser()

  const [step,       setStep]       = useState(1)
  const [saving,     setSaving]     = useState(false)
  const [importDone, setImportDone] = useState(false)

  const progressPct = Math.round(((step - 1) / (STEPS.length - 1)) * 100)
  const isRep       = session?.user.role === "REP"

  if (isRep) {
    return (
      <div className="max-w-lg mx-auto py-20 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-sky-50 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-7 h-7 text-sky-600" />
        </div>
        <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">Welcome to Leadkaun</h1>
        <p className="text-[13px] text-slate-500 leading-relaxed">
          Your manager has set up your account. Your priority queue is ready.
        </p>
        <button
          onClick={() => router.push("/queue")}
          className="mt-2 inline-flex items-center gap-2 h-10 px-6 rounded-full bg-sky-600 hover:bg-sky-700
                     text-white text-[13px] font-semibold transition-all active:scale-[0.97]"
        >
          Open My Queue →
        </button>
      </div>
    )
  }

  function next() { if (step < STEPS.length) setStep((s) => s + 1) }
  function back() { if (step > 1) setStep((s) => s - 1) }

  async function finish() {
    setSaving(true)
    await fetch("/api/settings/onboarding-complete", { method: "POST", credentials: "include" })
    queryClient.invalidateQueries({ queryKey: ["auth", "user"] })
    router.push("/dashboard")
    setSaving(false)
  }

  return (
    <div className="max-w-xl mx-auto py-8 space-y-6">

      {/* ── Progress ──────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-slate-900">
            Step {step} of {STEPS.length} — {STEPS[step - 1].title}
          </p>
          <p className="text-[12px] text-slate-400">{progressPct}% complete</p>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-sky-600 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex gap-1">
          {STEPS.map((s) => (
            <div
              key={s.id}
              className={`flex-1 h-1 rounded-full transition-colors duration-300 ${
                s.id < step ? "bg-sky-500" : s.id === step ? "bg-sky-300" : "bg-slate-100"
              }`}
            />
          ))}
        </div>
      </div>

      {/* ── Step content ──────────────────────────────────────────────────── */}
      <div className="glass-card px-6 py-6 min-h-[260px]">
        {step === 1 && <StepWelcome name={session?.user.firstName} />}
        {step === 2 && <StepIcp />}
        {step === 3 && <StepImport onImportDone={() => setImportDone(true)} />}
        {step === 4 && <StepTeam />}
        {step === 5 && <StepSqlThresholds />}
        {step === 6 && <StepReview importDone={importDone} />}
      </div>

      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button
          onClick={back}
          disabled={step === 1}
          className="h-9 px-4 rounded-full text-[13px] font-medium text-slate-500 hover:text-slate-900
                     hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-all"
        >
          ← Back
        </button>

        <div className="flex items-center gap-2">
          {!STEPS[step - 1].required && step < STEPS.length && (
            <button
              onClick={next}
              className="h-9 px-4 rounded-full text-[13px] font-medium text-slate-500
                         border border-slate-200 hover:bg-slate-50 transition-all"
            >
              Skip
            </button>
          )}

          {step < STEPS.length ? (
            <button
              onClick={next}
              className="h-9 px-5 rounded-full bg-sky-600 hover:bg-sky-700 text-white
                         text-[13px] font-semibold transition-all active:scale-[0.97]"
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={finish}
              disabled={saving}
              className="h-9 px-5 rounded-full bg-sky-600 hover:bg-sky-700 disabled:opacity-60
                         text-white text-[13px] font-semibold transition-all active:scale-[0.97]"
            >
              {saving ? "Finishing…" : "Go to Dashboard →"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Step 1 — Welcome ──────────────────────────────────────────────────────────

function StepWelcome({ name }: { name?: string }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[18px] font-bold text-slate-900">
          Welcome{name ? `, ${name}` : ""}! 👋
        </h2>
        <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">
          Leadkaun scores every lead on three dimensions and keeps your team focused on the right people.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Fit Score",     desc: "Does this lead match your ICP?",       color: "bg-sky-50 border-sky-100",    text: "text-sky-700" },
          { label: "Intent Score",  desc: "How engaged is this lead right now?",  color: "bg-emerald-50 border-emerald-100", text: "text-emerald-700" },
          { label: "Quality Score", desc: "Is the lead data complete enough?",    color: "bg-amber-50 border-amber-100",  text: "text-amber-700" },
        ].map((item) => (
          <div key={item.label} className={`rounded-xl border p-3 ${item.color}`}>
            <p className={`text-[12px] font-bold ${item.text}`}>{item.label}</p>
            <p className="text-[11px] text-slate-500 mt-1 leading-snug">{item.desc}</p>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-slate-400">
        This 6-step setup takes under 8 minutes and unlocks the full product.
      </p>
    </div>
  )
}

// ── Step 2 — ICP ──────────────────────────────────────────────────────────────

function StepIcp() {
  const [industries, setIndustries] = useState("")
  const [states,     setStates]     = useState("")
  const [budgetMin,  setBudgetMin]  = useState("")
  const [budgetMax,  setBudgetMax]  = useState("")
  const [saving,     setSaving]     = useState(false)

  async function save() {
    setSaving(true)
    await fetch("/api/settings/icp", {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        icp_industries: industries.split(",").map((s) => s.trim()).filter(Boolean),
        icp_states:     states.split(",").map((s) => s.trim()).filter(Boolean),
        icp_budget_min: budgetMin ? parseInt(budgetMin) : null,
        icp_budget_max: budgetMax ? parseInt(budgetMax) : null,
        icp_configured: true,
      }),
    })
    setSaving(false)
    toast.success("ICP saved")
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[16px] font-bold text-slate-900">Define Your Ideal Customer Profile</h2>
        <p className="text-[12px] text-slate-500 mt-0.5">
          This determines your leads&apos; Fit Score. You can update this anytime in Settings → ICP.
        </p>
      </div>
      <div className="space-y-3">
        <Field label="Target Industries (comma-separated)">
          <input className={inputCls} placeholder="e.g. Real Estate, Construction, IT Services"
            value={industries} onChange={(e) => setIndustries(e.target.value)} />
        </Field>
        <Field label="Target States (comma-separated)">
          <input className={inputCls} placeholder="e.g. Maharashtra, Karnataka, Delhi"
            value={states} onChange={(e) => setStates(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Min Budget (₹)">
            <input type="number" className={inputCls} placeholder="e.g. 50000"
              value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
          </Field>
          <Field label="Max Budget (₹)">
            <input type="number" className={inputCls} placeholder="e.g. 500000"
              value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
          </Field>
        </div>
      </div>
      <button
        onClick={save} disabled={saving}
        className="h-9 px-4 rounded-full bg-slate-900 hover:bg-slate-700 disabled:opacity-50
                   text-white text-[12px] font-semibold transition-all"
      >
        {saving ? "Saving…" : "Save ICP"}
      </button>
    </div>
  )
}

// ── Step 3 — Import ───────────────────────────────────────────────────────────

function StepImport({ onImportDone }: { onImportDone: () => void }) {
  const [uploading, setUploading] = useState(false)
  const [jobId,     setJobId]     = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)

    const [sourcesRes, stagesRes] = await Promise.all([
      fetch("/api/lead-sources",   { credentials: "include" }),
      fetch("/api/pipeline/stages", { credentials: "include" }),
    ])
    const sourcesData = sourcesRes.ok ? await sourcesRes.json() : { data: { sources: [] } }
    const stagesData  = stagesRes.ok  ? await stagesRes.json()  : { data: { stages:  [] } }

    const firstSource = sourcesData.data?.sources?.[0]?.id ?? sourcesData.sources?.[0]?.id
    const firstStage  = stagesData.data?.stages?.[0]?.id   ?? stagesData.stages?.[0]?.id

    if (!firstSource || !firstStage) {
      toast.error("No sources or stages found — contact support.")
      setUploading(false)
      return
    }

    const form = new FormData()
    form.append("file",      file)
    form.append("source_id", firstSource)
    form.append("stage_id",  firstStage)

    const res = await fetch("/api/import/csv", { method: "POST", body: form, credentials: "include" })
    setUploading(false)

    if (res.ok) {
      const { jobId: id } = await res.json()
      setJobId(id)
      toast.success("Import started — scoring in background")
      onImportDone()
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? "Upload failed")
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[16px] font-bold text-slate-900">Import Your Leads</h2>
        <p className="text-[12px] text-slate-500 mt-0.5">
          Upload a CSV with <strong>Name</strong> and <strong>Phone</strong> columns (minimum).
          All other fields optional.
        </p>
      </div>

      <label htmlFor="csv-upload"
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed
                    border-slate-200 hover:border-sky-300 bg-slate-50 hover:bg-sky-50/30
                    py-10 cursor-pointer transition-all ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
          <Upload className="w-5 h-5 text-slate-400" />
        </div>
        <div className="text-center">
          <p className="text-[13px] font-semibold text-slate-700">
            {uploading ? "Uploading…" : "Click to choose CSV"}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">or drag & drop</p>
        </div>
        <input id="csv-upload" type="file" accept=".csv" className="hidden"
          onChange={handleFile} disabled={uploading} />
      </label>

      {jobId && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-[12px] font-semibold text-emerald-700">Import started — leads will appear shortly</p>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        You can skip this and add leads manually from the Leads page.
      </p>
    </div>
  )
}

// ── Step 4 — Team ─────────────────────────────────────────────────────────────

function StepTeam() {
  const [email,   setEmail]   = useState("")
  const [role,    setRole]    = useState("REP")
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState<string[]>([])

  async function invite() {
    if (!email || sending) return
    setSending(true)
    const res = await fetch("/api/team/invite", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, role }),
    })
    setSending(false)
    if (res.ok) {
      setSent((p) => [...p, email])
      setEmail("")
      toast.success(`Invite sent to ${email}`)
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? "Failed to send invite")
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[16px] font-bold text-slate-900">Invite Your Team</h2>
        <p className="text-[12px] text-slate-500 mt-0.5">
          Invite sales reps and managers. They&apos;ll get a 48-hour sign-up link.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          className={`${inputCls} flex-1`}
          placeholder="colleague@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && invite()}
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="px-3 rounded-xl border border-slate-200 bg-white text-[13px] text-slate-700
                     focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
        >
          <option value="REP">Rep</option>
          <option value="MANAGER">Manager</option>
        </select>
        <button
          onClick={invite} disabled={sending || !email}
          className="h-10 px-4 rounded-full bg-sky-600 hover:bg-sky-700 disabled:opacity-50
                     text-white text-[13px] font-semibold transition-all shrink-0"
        >
          {sending ? "…" : "Invite"}
        </button>
      </div>
      {sent.length > 0 && (
        <div className="space-y-1">
          {sent.map((e) => (
            <div key={e} className="flex items-center gap-2 text-[12px] text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              Invite sent to {e}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Step 5 — SQL Thresholds ───────────────────────────────────────────────────

function StepSqlThresholds() {
  const [fitThreshold,    setFitThreshold]    = useState("55")
  const [intentThreshold, setIntentThreshold] = useState("45")
  const [saving,          setSaving]          = useState(false)

  async function save() {
    setSaving(true)
    await fetch("/api/settings/icp", {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        sql_fit_threshold:    parseInt(fitThreshold),
        sql_intent_threshold: parseInt(intentThreshold),
      }),
    })
    setSaving(false)
    toast.success("SQL thresholds saved")
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[16px] font-bold text-slate-900">SQL Thresholds</h2>
        <p className="text-[12px] text-slate-500 mt-0.5">
          A lead becomes Sales-Qualified when both Fit and Intent cross these thresholds.
          Your team gets an alert when it happens.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Fit Score Threshold (0–100)">
          <input type="number" min={0} max={100} className={inputCls}
            value={fitThreshold} onChange={(e) => setFitThreshold(e.target.value)} />
        </Field>
        <Field label="Intent Score Threshold (0–100)">
          <input type="number" min={0} max={100} className={inputCls}
            value={intentThreshold} onChange={(e) => setIntentThreshold(e.target.value)} />
        </Field>
      </div>
      <p className="text-[11px] text-slate-400">
        Default: Fit ≥ 55, Intent ≥ 45. Raise these to get fewer, higher-quality SQL alerts.
      </p>
      <button
        onClick={save} disabled={saving}
        className="h-9 px-4 rounded-full bg-slate-900 hover:bg-slate-700 disabled:opacity-50
                   text-white text-[12px] font-semibold transition-all"
      >
        {saving ? "Saving…" : "Save Thresholds"}
      </button>
    </div>
  )
}

// ── Step 6 — Review ───────────────────────────────────────────────────────────

function StepReview({ importDone }: { importDone: boolean }) {
  const { data: leads } = useQuery({
    queryKey:        ["leads-sample"],
    queryFn:         async () => {
      const res = await fetch("/api/leads?page=1", { credentials: "include" })
      if (!res.ok) return []
      const data = await res.json()
      return data.data?.leads ?? data.leads ?? []
    },
    refetchInterval: 5_000,
    enabled:         importDone,
  })

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[16px] font-bold text-slate-900">Review & Launch</h2>
        <p className="text-[12px] text-slate-500 mt-0.5">
          {importDone
            ? "Your leads are being scored. Here's a preview:"
            : "You're all set. Click Go to Dashboard to start using Leadkaun."}
        </p>
      </div>

      {importDone && (
        leads && leads.length > 0 ? (
          <div className="space-y-2">
            {leads.slice(0, 5).map((lead: { id: string; first_name: string; last_name: string | null; grade: string; company_name: string | null }) => (
              <div key={lead.id} className="flex items-center gap-3 rounded-xl border border-slate-100
                                            bg-white px-3.5 py-2.5">
                <GradeBadge grade={lead.grade as "A"|"B"|"C"|"D"|"E"|"F"} size="sm" />
                <p className="text-[13px] font-semibold text-slate-900">
                  {lead.first_name} {lead.last_name}
                </p>
                {lead.company_name && (
                  <p className="text-[12px] text-slate-400">{lead.company_name}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl bg-sky-50 border border-sky-100 px-4 py-3">
            <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <p className="text-[12px] text-sky-700 font-medium">Scoring in progress — takes about 30 seconds</p>
          </div>
        )
      )}

      {!importDone && (
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-4 space-y-1.5">
          {[
            "Priority queue sorted by grade and urgency",
            "Automatic follow-up scheduling",
            "Loss intelligence analytics",
            "Real-time lead scoring",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-[12px] text-slate-600">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
