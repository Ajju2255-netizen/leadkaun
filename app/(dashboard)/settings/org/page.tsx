"use client"

import { useState, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { Building2 } from "lucide-react"

const TEAM_SIZE_OPTIONS = [
  { value: "SOLO",       label: "Solo (just me)"    },
  { value: "SMALL",      label: "Small (2–10)"      },
  { value: "MEDIUM",     label: "Medium (11–50)"    },
  { value: "LARGE",      label: "Large (51–200)"    },
  { value: "ENTERPRISE", label: "Enterprise (200+)" },
]

const LEAD_VOL_OPTIONS = [
  { value: "UNDER_50",         label: "Under 50 / month"   },
  { value: "BETWEEN_50_200",   label: "50–200 / month"     },
  { value: "BETWEEN_200_500",  label: "200–500 / month"    },
  { value: "BETWEEN_500_1000", label: "500–1000 / month"   },
  { value: "OVER_1000",        label: "Over 1000 / month"  },
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

export default function OrgPage() {
  const qc = useQueryClient()

  const [loaded,   setLoaded]   = useState(false)
  const [orgName,  setOrgName]  = useState("")
  const [industry, setIndustry] = useState("")
  const [city,     setCity]     = useState("")
  const [state,    setState]    = useState("")
  const [teamSize, setTeamSize] = useState("SMALL")
  const [leadVol,  setLeadVol]  = useState("BETWEEN_50_200")
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    fetch("/api/profile/account", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        // API returns { account } directly — accept both shapes
        const a = d?.account ?? d?.data?.account ?? {}
        setOrgName(a.name ?? "")
        setIndustry(a.industry ?? "")
        setCity(a.city ?? "")
        setState(a.state ?? "")
        setTeamSize(a.team_size ?? "SMALL")
        setLeadVol(a.monthly_lead_vol ?? "BETWEEN_50_200")
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  async function handleSave() {
    if (saving) return
    setSaving(true)
    const res = await fetch("/api/profile/account", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: orgName.trim(), industry: industry.trim(),
        city: city.trim(), state: state.trim(),
        team_size: teamSize, monthly_lead_vol: leadVol,
      }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success("Organisation updated")
      qc.invalidateQueries({ queryKey: ["auth", "user"] })
    } else {
      toast.error("Failed to save")
    }
  }

  if (!loaded) return (
    <div className="space-y-5 max-w-xl">
      <Skeleton className="h-8 w-40 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  )

  return (
    <div className="space-y-5 max-w-xl">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_18px_rgba(14,165,233,0.32)]">
          <Building2 className="w-6 h-6 text-white" strokeWidth={2.4} />
        </div>
        <div>
          <h1 className="text-[26px] font-extrabold text-slate-900 tracking-tight leading-tight">Organisation</h1>
          <p className="text-[13px] text-slate-500 mt-0.5">Your workspace details.</p>
        </div>
      </div>

      <div className="glass-card px-5 py-5 space-y-4">
        <Field label="Organisation name">
          <input className={inputCls} value={orgName}
            onChange={(e) => setOrgName(e.target.value)} placeholder="Acme Real Estate" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Industry">
            <input className={inputCls} value={industry}
              onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Real Estate" />
          </Field>
          <Field label="City">
            <input className={inputCls} value={city}
              onChange={(e) => setCity(e.target.value)} placeholder="e.g. Mumbai" />
          </Field>
        </div>

        <Field label="State">
          <input className={inputCls} value={state}
            onChange={(e) => setState(e.target.value)} placeholder="e.g. Maharashtra" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Team size">
            <select value={teamSize} onChange={(e) => setTeamSize(e.target.value)}
              className={`${inputCls} bg-white`}>
              {TEAM_SIZE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Monthly lead volume">
            <select value={leadVol} onChange={(e) => setLeadVol(e.target.value)}
              className={`${inputCls} bg-white`}>
              {LEAD_VOL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !orgName.trim() || !industry.trim() || !city.trim() || !state.trim()}
          className="h-9 px-5 rounded-full bg-sky-600 hover:bg-sky-700 disabled:opacity-50
                     text-white text-[13px] font-semibold transition-all active:scale-[0.97]"
        >
          {saving ? "Saving…" : "Save organisation"}
        </button>
      </div>
    </div>
  )
}
