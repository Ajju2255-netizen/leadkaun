"use client"

import { useState, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

const INDUSTRY_OPTIONS = [
  "Real Estate", "Healthcare", "Education", "IT Services", "Manufacturing",
  "Retail", "Financial Services", "Construction", "Hospitality", "Automotive",
  "Agriculture", "Logistics", "Textiles", "Pharma", "Media & Entertainment",
]

const STATE_OPTIONS = [
  "Maharashtra", "Karnataka", "Tamil Nadu", "Delhi", "Gujarat", "Rajasthan",
  "Uttar Pradesh", "West Bengal", "Telangana", "Kerala", "Andhra Pradesh",
  "Madhya Pradesh", "Punjab", "Haryana", "Bihar",
]

const BUSINESS_TYPE_OPTIONS = [
  "B2B", "B2C", "D2C", "Franchise", "Distributor", "SaaS", "Agency", "Manufacturer",
]

const ROLE_OPTIONS = [
  "Owner / Founder", "CEO / MD", "Sales Head", "Marketing Manager",
  "Purchase Manager", "HR Manager", "Operations Head", "IT Manager",
]

const SALES_CYCLE_OPTIONS = [
  { value: "SAME_DAY", label: "Same day" },
  { value: "THREE_DAYS", label: "3 days" },
  { value: "TWO_WEEKS", label: "2 weeks" },
  { value: "FOUR_WEEKS", label: "4 weeks" },
  { value: "THREE_MONTHS", label: "3 months" },
  { value: "OVER_THREE_MONTHS", label: "Over 3 months" },
]

interface IcpData {
  icp_configured: boolean
  icp_industries: string[]
  icp_states: string[]
  icp_business_types: string[]
  icp_roles: string[]
  icp_budget_min: number | null
  icp_budget_max: number | null
  icp_sales_cycle: string | null
  sql_fit_threshold: number
  sql_intent_threshold: number
  weight_overrides: Record<string, number> | null
}

async function fetchIcp(): Promise<IcpData> {
  const res = await fetch("/api/settings/icp")
  if (!res.ok) throw new Error("Failed to fetch ICP")
  return res.json().then((r) => r.data.icp)
}

function ToggleChips({
  options,
  selected,
  onChange,
}: {
  options: string[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  function toggle(val: string) {
    onChange(selected.includes(val) ? selected.filter((s) => s !== val) : [...selected, val])
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => toggle(opt)}
          className={`px-3 py-1 rounded-full text-sm border transition-colors ${
            selected.includes(opt)
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-foreground border-border hover:border-primary"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

export default function IcpPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<IcpData>({ queryKey: ["icp-settings"], queryFn: fetchIcp })

  const [industries, setIndustries] = useState<string[]>([])
  const [states, setStates] = useState<string[]>([])
  const [businessTypes, setBusinessTypes] = useState<string[]>([])
  const [roles, setRoles] = useState<string[]>([])
  const [budgetMin, setBudgetMin] = useState("")
  const [budgetMax, setBudgetMax] = useState("")
  const [salesCycle, setSalesCycle] = useState("")
  const [fitThreshold, setFitThreshold] = useState(60)
  const [intentThreshold, setIntentThreshold] = useState(50)

  const [banner, setBanner] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!data) return
    setIndustries(data.icp_industries ?? [])
    setStates(data.icp_states ?? [])
    setBusinessTypes(data.icp_business_types ?? [])
    setRoles(data.icp_roles ?? [])
    setBudgetMin(data.icp_budget_min != null ? String(data.icp_budget_min) : "")
    setBudgetMax(data.icp_budget_max != null ? String(data.icp_budget_max) : "")
    setSalesCycle(data.icp_sales_cycle ?? "")
    setFitThreshold(data.sql_fit_threshold ?? 60)
    setIntentThreshold(data.sql_intent_threshold ?? 50)
  }, [data])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setBanner("")
    try {
      const res = await fetch("/api/settings/icp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          icp_industries:       industries,
          icp_states:           states,
          icp_business_types:   businessTypes,
          icp_roles:            roles,
          icp_budget_min:       budgetMin ? parseInt(budgetMin) : null,
          icp_budget_max:       budgetMax ? parseInt(budgetMax) : null,
          icp_sales_cycle:      salesCycle || undefined,
          sql_fit_threshold:    fitThreshold,
          sql_intent_threshold: intentThreshold,
          icp_configured:       true,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Save failed")
      setBanner(`${json.data.updated} leads queued for regrading`)
      qc.invalidateQueries({ queryKey: ["icp-settings"] })
    } catch (err: unknown) {
      setBanner(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">ICP & Scoring Settings</h1>
        <p className="text-muted-foreground mt-1">
          Define your Ideal Customer Profile. Changing these settings will regrade all active leads.
        </p>
      </div>

      {banner && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
          {banner}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* Industries */}
        <div className="space-y-3">
          <Label className="text-base font-medium">Target Industries</Label>
          <ToggleChips options={INDUSTRY_OPTIONS} selected={industries} onChange={setIndustries} />
        </div>

        {/* States */}
        <div className="space-y-3">
          <Label className="text-base font-medium">Target States</Label>
          <ToggleChips options={STATE_OPTIONS} selected={states} onChange={setStates} />
        </div>

        {/* Business Types */}
        <div className="space-y-3">
          <Label className="text-base font-medium">Business Types</Label>
          <ToggleChips options={BUSINESS_TYPE_OPTIONS} selected={businessTypes} onChange={setBusinessTypes} />
        </div>

        {/* Decision Maker Roles */}
        <div className="space-y-3">
          <Label className="text-base font-medium">Decision Maker Roles</Label>
          <ToggleChips options={ROLE_OPTIONS} selected={roles} onChange={setRoles} />
        </div>

        {/* Budget */}
        <div className="space-y-3">
          <Label className="text-base font-medium">Budget Range (₹)</Label>
          <div className="flex gap-4 items-center">
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Min</Label>
              <Input
                type="number"
                placeholder="e.g. 50000"
                value={budgetMin}
                onChange={(e) => setBudgetMin(e.target.value)}
              />
            </div>
            <span className="text-muted-foreground mt-5">—</span>
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Max</Label>
              <Input
                type="number"
                placeholder="e.g. 500000"
                value={budgetMax}
                onChange={(e) => setBudgetMax(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Sales Cycle */}
        <div className="space-y-2">
          <Label className="text-base font-medium">Typical Sales Cycle</Label>
          <Select value={salesCycle} onValueChange={(v) => setSalesCycle(v ?? "")}>
            <SelectTrigger className="w-60">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {SALES_CYCLE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <hr />

        {/* SQL Thresholds */}
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold mb-1">SQL Thresholds</h2>
            <p className="text-sm text-muted-foreground">
              A lead is marked SQL when both fit and intent scores exceed these thresholds.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Fit Score Threshold</Label>
              <span className="text-sm font-medium tabular-nums">{fitThreshold}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={fitThreshold}
              onChange={(e) => setFitThreshold(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Lenient (0)</span>
              <span>Strict (100)</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Intent Score Threshold</Label>
              <span className="text-sm font-medium tabular-nums">{intentThreshold}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={intentThreshold}
              onChange={(e) => setIntentThreshold(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Lenient (0)</span>
              <span>Strict (100)</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={saving} size="lg">
            {saving ? "Saving…" : "Save & Regrade Leads"}
          </Button>
        </div>
      </form>
    </div>
  )
}
