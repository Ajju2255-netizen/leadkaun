"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { CheckCircle2, Upload, ArrowRight } from "lucide-react"
import { trackFunnel } from "@/lib/analytics/funnel"

/**
 * Activation-first onboarding (Slice 1).
 *
 * The previous flow was Welcome → ICP → a bare CSV uploader → team → SQL
 * thresholds → dashboard: six steps of configuration before the user had ever
 * seen Leadkaun do anything. Every one of the first Meta-ad signups completed
 * it and none imported a lead.
 *
 * The order is now: experience the intelligence, then configure it.
 *
 *   Welcome → Upload (hands into /leads/import) → analysis → intelligence
 *   report → import → back here for ICP → the queue
 *
 * The upload step deliberately does NOT reimplement importing. It hands over to
 * /leads/import, which already runs analyse → IntakeReport → approve → import.
 * That screen was the product's best moment and onboarding used to route around
 * it. Team invites and SQL thresholds are no longer here at all — the defaults
 * (Fit ≥ 55, Intent ≥ 45) are sensible, and neither belongs in a first run.
 */

const STEPS = [
  { id: 1, title: "Bring your leads" },
  { id: 2, title: "Make it yours" },
]

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

export default function OnboardingPage() {
  const router = useRouter()
  const { data: session } = useCurrentUser()

  const [step, setStep]         = useState(1)
  const [imported, setImported] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const isRep = session?.user.role === "REP"

  // Read from window rather than useSearchParams so this page needs no Suspense
  // boundary. /leads/import sends the user back here with ?step=icp&imported=1.
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search)
      if (p.get("step") === "icp") setStep(2)
      if (p.get("imported") === "1") setImported(true)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!isRep) trackFunnel("onboarding_started")
  }, [isRep])

  async function finish() {
    setFinishing(true)
    try {
      await fetch("/api/settings/onboarding-complete", { method: "POST", credentials: "include" })
    } catch {
      /* completion is a marker, not a gate — never block the user on it */
    }
    // Straight to the queue: the point of the product is who to call first.
    router.push("/queue")
  }

  // Invited reps never see the wizard — their workspace is already set up.
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
          className="mt-2 inline-flex items-center gap-2 h-10 px-6 rounded-full bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]
                     text-white text-[13px] font-semibold transition-all active:scale-[0.97]"
        >
          Open My Queue →
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-8">
      {/* Progress */}
      <div className="space-y-3">
        <p className="text-[12px] font-semibold text-slate-400">
          Step {step} of {STEPS.length} — {STEPS[step - 1].title}
        </p>
        <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-500 transition-all duration-500"
            style={{ width: `${step === 1 ? 50 : 100}%` }}
          />
        </div>
      </div>

      {step === 1 && <StepBringLeads firstName={session?.user.firstName} onSkip={() => setStep(2)} />}
      {step === 2 && <StepMakeItYours imported={imported} onFinish={finish} finishing={finishing} />}
    </div>
  )
}

/* ── Step 1 — the whole point of the first run ──────────────────────────────
   No Fit/Intent/Quality lecture. The user does not care yet; they signed up to
   see what Leadkaun does with their leads. */

function StepBringLeads({ firstName, onSkip }: { firstName?: string; onSkip: () => void }) {
  const router = useRouter()

  function upload() {
    trackFunnel("import_started", { from: "onboarding" })
    router.push("/leads/import?from=onboarding")
  }

  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <h1 className="text-[26px] font-bold text-slate-900 tracking-[-0.02em]">
          Welcome{firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="text-[15px] text-slate-600 leading-relaxed max-w-lg">
          Let&apos;s find out which of your leads deserve attention first. Bring in the leads you
          already have and Leadkaun will read them, work out what it can, and show you where to
          start.
        </p>
      </div>

      <button
        onClick={upload}
        className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-gradient-to-b from-sky-400 to-sky-500
                   hover:from-sky-500 hover:to-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]
                   text-white text-[14px] font-semibold transition-all active:scale-[0.97]"
      >
        <Upload className="w-4 h-4" />
        Upload my leads
      </button>
      <p className="text-[12px] text-slate-400 -mt-4">CSV or Excel export from your CRM, sheet, or portal.</p>

      {/* What happens next — three words each, no jargon */}
      <div className="grid grid-cols-3 gap-3 pt-2">
        {[
          { n: "01", t: "Understand", d: "We read your lead data and tell you what we found." },
          { n: "02", t: "Profile",    d: "Each lead gets an initial read on fit and intent." },
          { n: "03", t: "Prioritise", d: "You see who deserves the first call." },
        ].map((s) => (
          <div key={s.n} className="rounded-xl border border-slate-100 bg-white p-4">
            <p className="text-[10px] font-mono font-semibold text-slate-300">{s.n}</p>
            <p className="mt-1.5 text-[13px] font-semibold text-slate-900">{s.t}</p>
            <p className="mt-1 text-[11.5px] text-slate-500 leading-snug">{s.d}</p>
          </div>
        ))}
      </div>

      <div className="pt-2 border-t border-slate-100">
        <button
          onClick={onSkip}
          className="text-[12.5px] text-slate-400 hover:text-slate-600 transition-colors"
        >
          I don&apos;t have my leads to hand — set up later →
        </button>
      </div>
    </div>
  )
}

/* ── Step 2 — ICP, now that the user has seen what it is for ────────────────── */

function StepMakeItYours({
  imported, onFinish, finishing,
}: { imported: boolean; onFinish: () => void; finishing: boolean }) {
  const [industries, setIndustries] = useState("")
  const [states,     setStates]     = useState("")
  const [budgetMin,  setBudgetMin]  = useState("")
  const [budgetMax,  setBudgetMax]  = useState("")
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)

  async function save() {
    setSaving(true)
    try {
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
      setSaved(true)
      toast.success("Saved — prioritisation now uses this")
    } catch {
      toast.error("Could not save. You can set this later in Settings → ICP.")
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-[22px] font-bold text-slate-900 tracking-[-0.02em]">
          Now make it specific to your business.
        </h1>
        <p className="text-[13.5px] text-slate-600 leading-relaxed max-w-lg">
          {imported
            ? "Leadkaun has read your leads. Tell us what a good opportunity looks like for you, and prioritisation gets sharper."
            : "Tell us what a good opportunity looks like for you. This is what Fit Score measures — you can change it any time in Settings → ICP."}
        </p>
      </div>

      <div className="space-y-3">
        <Field label="Target industries (comma-separated)">
          <input className={inputCls} placeholder="e.g. Real Estate, Construction, IT Services"
            value={industries} onChange={(e) => setIndustries(e.target.value)} />
        </Field>
        <Field label="Target states (comma-separated)">
          <input className={inputCls} placeholder="e.g. Maharashtra, Karnataka, Delhi"
            value={states} onChange={(e) => setStates(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Min budget (₹)">
            <input type="number" className={inputCls} placeholder="e.g. 50000"
              value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
          </Field>
          <Field label="Max budget (₹)">
            <input type="number" className={inputCls} placeholder="e.g. 500000"
              value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={save} disabled={saving}
          className="h-9 px-4 rounded-full bg-slate-900 hover:bg-slate-700 disabled:opacity-50
                     text-white text-[12px] font-semibold transition-all"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
        <button
          onClick={onFinish}
          disabled={finishing}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-gradient-to-b from-sky-400 to-sky-500
                     hover:from-sky-500 hover:to-sky-600 disabled:opacity-50
                     text-white text-[12px] font-semibold transition-all"
        >
          {finishing ? "Opening…" : "Go to my queue"} <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="text-[11.5px] text-slate-400">
        Thresholds and team invites live in Settings — nothing else is needed to start.
      </p>
    </div>
  )
}
