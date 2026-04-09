"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { useCurrentUser } from "@/hooks/useCurrentUser"

const STEPS = [
  { id: 1, title: "Your Business",       required: true  },
  { id: 2, title: "Define Your ICP",     required: false },
  { id: 3, title: "Add Your Leads",      required: true  },
  { id: 4, title: "Invite Your Team",    required: false },
  { id: 5, title: "SQL Thresholds",      required: true  },
  { id: 6, title: "Review Your Leads",   required: true  },
]

export default function OnboardingPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: session } = useCurrentUser()

  const [step, setStep]         = useState(1)
  const [saving, setSaving]     = useState(false)
  const [importDone, setImportDone] = useState(false)

  // Step 1 — business info (already captured at register, show welcome)
  // Step 3 — import leads
  // Step 6 — review scored leads

  const progressPct = Math.round(((step - 1) / (STEPS.length - 1)) * 100)
  const isRep = session?.user.role === "REP"

  if (isRep) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <h1 className="text-2xl font-bold">Welcome to Leadkaun</h1>
        <p className="text-muted-foreground">
          Your manager has set up your account. Your priority queue is ready.
        </p>
        <Button onClick={() => router.push("/queue")}>Open My Queue →</Button>
      </div>
    )
  }

  function next() { if (step < STEPS.length) setStep((s) => s + 1) }
  function back() { if (step > 1) setStep((s) => s - 1) }

  async function finish() {
    setSaving(true)
    // Mark onboarding complete on the account
    await fetch("/api/settings/onboarding-complete", { method: "POST", credentials: "include" })
    queryClient.invalidateQueries({ queryKey: ["auth", "user"] })
    router.push("/dashboard")
    setSaving(false)
  }

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Step {step} of {STEPS.length}</span>
          <span className="text-muted-foreground">{STEPS[step - 1].title}</span>
        </div>
        <Progress value={progressPct} className="h-2" />
        <div className="flex gap-1">
          {STEPS.map((s) => (
            <div
              key={s.id}
              className={`flex-1 h-1 rounded-full transition-colors ${
                s.id < step ? "bg-primary" : s.id === step ? "bg-primary/50" : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="rounded-lg border bg-card p-6 min-h-[16rem]">
        {step === 1 && <StepWelcome name={session?.user.firstName} />}
        {step === 2 && <StepIcp />}
        {step === 3 && <StepImport onImportDone={() => setImportDone(true)} />}
        {step === 4 && <StepTeam />}
        {step === 5 && <StepSqlThresholds />}
        {step === 6 && <StepReview importDone={importDone} />}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={back} disabled={step === 1}>← Back</Button>

        {!STEPS[step - 1].required && step < STEPS.length && (
          <Button variant="outline" onClick={next}>Skip this step</Button>
        )}

        {step < STEPS.length ? (
          <Button onClick={next}>
            {STEPS[step - 1].title} Done →
          </Button>
        ) : (
          <Button onClick={finish} disabled={saving}>
            {saving ? "Finishing…" : "Go to Dashboard →"}
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Step components ────────────────────────────────────────────────────────

function StepWelcome({ name }: { name?: string }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Welcome{name ? `, ${name}` : ""}!</h2>
      <p className="text-muted-foreground">
        Leadkaun scores every lead using three dimensions — Fit, Intent, and Quality —
        and ranks your team&apos;s priority queue automatically.
      </p>
      <p className="text-muted-foreground">
        This 6-step setup takes under 8 minutes and unlocks all 12 modules.
        Let&apos;s start by confirming your business profile.
      </p>
      <div className="grid grid-cols-3 gap-4 pt-4">
        {[
          { label: "Fit Score",     desc: "Does this lead match your ICP?" },
          { label: "Intent Score",  desc: "How engaged is this lead?" },
          { label: "Quality Score", desc: "Is the lead data complete?" },
        ].map((item) => (
          <div key={item.label} className="rounded-lg bg-muted p-3 text-center">
            <p className="text-sm font-semibold">{item.label}</p>
            <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function StepIcp() {
  const [industries, setIndustries] = useState("")
  const [states, setStates]         = useState("")
  const [budgetMin, setBudgetMin]   = useState("")
  const [budgetMax, setBudgetMax]   = useState("")
  const [saving, setSaving]         = useState(false)

  async function save() {
    setSaving(true)
    await fetch("/api/settings/icp", {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        icp_industries:  industries.split(",").map((s) => s.trim()).filter(Boolean),
        icp_states:      states.split(",").map((s) => s.trim()).filter(Boolean),
        icp_budget_min:  budgetMin ? parseInt(budgetMin) : null,
        icp_budget_max:  budgetMax ? parseInt(budgetMax) : null,
        icp_configured:  true,
      }),
    })
    setSaving(false)
    toast.success("ICP saved")
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Define Your Ideal Customer Profile</h2>
      <p className="text-sm text-muted-foreground">
        This determines your leads&apos; Fit Score. You can update this anytime in Settings → ICP.
      </p>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Target Industries (comma-separated)</Label>
          <Input placeholder="e.g. Real Estate, Construction, IT Services" value={industries} onChange={(e) => setIndustries(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Target States (comma-separated)</Label>
          <Input placeholder="e.g. Maharashtra, Karnataka, Delhi" value={states} onChange={(e) => setStates(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Min Budget (₹)</Label>
            <Input type="number" placeholder="e.g. 50000" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Max Budget (₹)</Label>
            <Input type="number" placeholder="e.g. 500000" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
          </div>
        </div>
      </div>
      <Button onClick={save} disabled={saving} size="sm">{saving ? "Saving…" : "Save ICP"}</Button>
    </div>
  )
}

function StepImport({ onImportDone }: { onImportDone: () => void }) {
  const [uploading, setUploading] = useState(false)
  const [jobId, setJobId]         = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)

    // Get default source + stage
    const [sourcesRes, stagesRes] = await Promise.all([
      fetch("/api/lead-sources", { credentials: "include" }),
      fetch("/api/pipeline/stages", { credentials: "include" }),
    ])
    const sources = sourcesRes.ok ? await sourcesRes.json() : { sources: [] }
    const stages  = stagesRes.ok  ? await stagesRes.json()  : { stages:  [] }

    const firstSource = sources.sources?.[0]?.id
    const firstStage  = stages.stages?.[0]?.id

    if (!firstSource || !firstStage) {
      toast.error("No lead sources or stages found. Please contact support.")
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
      toast.success("Upload started! Processing in background…")
      onImportDone()
    } else {
      const err = await res.json()
      toast.error(err.error ?? "Upload failed")
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Import Your Leads</h2>
      <p className="text-sm text-muted-foreground">
        Upload a CSV with your lead data. Required columns: <strong>Name</strong> and <strong>Phone</strong>.
        All other fields are optional.
      </p>
      <div className="rounded-lg border-2 border-dashed p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Drag & drop a CSV file, or click to browse</p>
        <input
          type="file"
          accept=".csv"
          className="hidden"
          id="csv-upload"
          onChange={handleFile}
          disabled={uploading}
        />
        <label
          htmlFor="csv-upload"
          className={`inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium cursor-pointer hover:bg-accent hover:text-accent-foreground ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        >
          {uploading ? "Uploading…" : "Choose CSV File"}
        </label>
        {jobId && (
          <p className="text-xs text-green-600 font-medium">Import started (Job: {jobId.slice(0, 8)}…)</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        You can also skip this step and add leads manually from the Leads page.
      </p>
    </div>
  )
}

function StepTeam() {
  const [email, setEmail]   = useState("")
  const [role, setRole]     = useState("REP")
  const [sending, setSending] = useState(false)
  const [sent, setSent]     = useState<string[]>([])

  async function invite() {
    if (!email) return
    setSending(true)
    const res = await fetch("/api/team/invite", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, role }),
    })
    setSending(false)
    if (res.ok) {
      setSent((prev) => [...prev, email])
      setEmail("")
      toast.success(`Invite sent to ${email}`)
    } else {
      const err = await res.json()
      toast.error(err.error ?? "Failed to send invite")
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Invite Your Team</h2>
      <p className="text-sm text-muted-foreground">
        Invite sales reps and managers. They&apos;ll get a 48-hour sign-up link.
      </p>
      <div className="flex gap-2">
        <Input
          placeholder="colleague@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1"
        />
        <Select value={role} onValueChange={(v) => setRole(v ?? "REP")}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="REP">Rep</SelectItem>
            <SelectItem value="MANAGER">Manager</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={invite} disabled={sending || !email} size="sm">
          {sending ? "…" : "Invite"}
        </Button>
      </div>
      {sent.length > 0 && (
        <div className="text-sm text-green-600 space-y-1">
          {sent.map((e) => <p key={e}>✓ Invite sent to {e}</p>)}
        </div>
      )}
    </div>
  )
}

function StepSqlThresholds() {
  const [fitThreshold,    setFitThreshold]    = useState("55")
  const [intentThreshold, setIntentThreshold] = useState("45")
  const [saving, setSaving] = useState(false)

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
      <h2 className="text-lg font-semibold">SQL Thresholds</h2>
      <p className="text-sm text-muted-foreground">
        A lead becomes Sales-Qualified (SQL) when both Fit and Intent cross these thresholds.
        Your team gets an alert when this happens.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Fit Score Threshold (0–100)</Label>
          <Input type="number" min={0} max={100} value={fitThreshold} onChange={(e) => setFitThreshold(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Intent Score Threshold (0–100)</Label>
          <Input type="number" min={0} max={100} value={intentThreshold} onChange={(e) => setIntentThreshold(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Default: Fit ≥ 55, Intent ≥ 45. Raise these if you want fewer, higher-quality SQL alerts.
      </p>
      <Button onClick={save} disabled={saving} size="sm">{saving ? "Saving…" : "Save Thresholds"}</Button>
    </div>
  )
}

function StepReview({ importDone }: { importDone: boolean }) {
  const { data: leads } = useLeadsSample()

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Review Your Leads</h2>
      {importDone ? (
        <>
          <p className="text-sm text-muted-foreground">
            Your leads are being scored. Here&apos;s a preview of the first few:
          </p>
          {leads && leads.length > 0 ? (
            <div className="space-y-2">
              {leads.slice(0, 5).map((lead: { id: string; first_name: string; last_name: string | null; grade: string; company_name: string | null }) => (
                <div key={lead.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                  <span className={`inline-flex items-center justify-center rounded-md border font-bold text-xs px-1.5 py-0.5 ${
                    lead.grade === "A" ? "bg-green-100 text-green-700" :
                    lead.grade === "B" ? "bg-blue-100 text-blue-700" :
                    lead.grade === "C" ? "bg-yellow-100 text-yellow-700" :
                    "bg-muted text-muted-foreground"
                  }`}>{lead.grade}</span>
                  <p className="text-sm font-medium">{lead.first_name} {lead.last_name}</p>
                  {lead.company_name && <p className="text-xs text-muted-foreground">{lead.company_name}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Scoring in progress… this takes about 30 seconds.</p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          You skipped the import step. You can add leads manually from the Leads page after setup.
        </p>
      )}
    </div>
  )
}

function useLeadsSample() {
  return useQuery({
    queryKey: ["leads-sample"],
    queryFn:  async () => {
      const res = await fetch("/api/leads?page=1", { credentials: "include" })
      if (!res.ok) return []
      const data = await res.json()
      return data.leads ?? []
    },
    refetchInterval: 5000,
  })
}
