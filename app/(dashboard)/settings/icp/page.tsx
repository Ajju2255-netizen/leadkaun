"use client"

import { useState, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Lightbulb, Trophy, ChevronDown, ChevronUp, Sparkles } from "lucide-react"

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
  { value: "SAME_DAY",          label: "Same day" },
  { value: "THREE_DAYS",        label: "3 days" },
  { value: "TWO_WEEKS",         label: "2 weeks" },
  { value: "FOUR_WEEKS",        label: "4 weeks" },
  { value: "THREE_MONTHS",      label: "3 months" },
  { value: "OVER_THREE_MONTHS", label: "Over 3 months" },
]

interface IcpData {
  icp_configured:      boolean
  icp_industries:      string[]
  icp_states:          string[]
  icp_business_types:  string[]
  icp_roles:           string[]
  icp_budget_min:      number | null
  icp_budget_max:      number | null
  icp_sales_cycle:     string | null
  sql_fit_threshold:   number
  sql_intent_threshold: number
  weight_overrides:    Record<string, number> | null
}

interface SuggestionItem {
  value:     string
  total:     number
  won:       number
  won_value?: number
}

interface Suggestions {
  industries:     SuggestionItem[]
  states:         SuggestionItem[]
  roles:          SuggestionItem[]
  has_won_leads:  boolean
  total_analyzed: number
}

async function fetchIcp(): Promise<IcpData> {
  const res = await fetch("/api/settings/icp")
  if (!res.ok) throw new Error("Failed to fetch ICP")
  return res.json().then((r) => r.data.icp)
}

async function fetchSuggestions(): Promise<Suggestions> {
  const res = await fetch("/api/settings/icp/suggestions")
  if (!res.ok) throw new Error("Failed to fetch suggestions")
  return res.json().then((r) => r.data)
}

// ── Toggle chips ──────────────────────────────────────────────────────────────

function ToggleChips({
  options,
  selected,
  onChange,
  suggestions,
}: {
  options:     string[]
  selected:    string[]
  onChange:    (v: string[]) => void
  suggestions?: SuggestionItem[]
}) {
  function toggle(val: string) {
    onChange(selected.includes(val) ? selected.filter((s) => s !== val) : [...selected, val])
  }

  const sugMap = new Map(suggestions?.map((s) => [s.value, s]))

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const sug    = sugMap.get(opt)
        const active = selected.includes(opt)
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`
              inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border transition-colors
              ${active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:border-primary"}
            `}
          >
            {opt}
            {sug && sug.total > 0 && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              }`}>
                {sug.total}
              </span>
            )}
            {sug && sug.won > 0 && (
              <Trophy className={`w-3 h-3 ${active ? "text-yellow-200" : "text-amber-500"}`} />
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Suggestions panel ─────────────────────────────────────────────────────────

function SuggestionsPanel({
  suggestions,
  currentIndustries,
  currentStates,
  currentRoles,
  onApplyIndustries,
  onApplyStates,
  onApplyRoles,
}: {
  suggestions:       Suggestions
  currentIndustries: string[]
  currentStates:     string[]
  currentRoles:      string[]
  onApplyIndustries: (vals: string[]) => void
  onApplyStates:     (vals: string[]) => void
  onApplyRoles:      (vals: string[]) => void
}) {
  const [expanded, setExpanded] = useState(true)

  const newIndustries = suggestions.industries.filter((s) => !currentIndustries.includes(s.value))
  const newStates     = suggestions.states.filter((s) => !currentStates.includes(s.value))
  const newRoles      = suggestions.roles.filter((s) => !currentRoles.includes(s.value))
  const hasNew = newIndustries.length > 0 || newStates.length > 0 || newRoles.length > 0

  if (!hasNew && suggestions.total_analyzed < 5) return null

  function applyAll() {
    if (newIndustries.length) onApplyIndustries([...currentIndustries, ...newIndustries.map((i) => i.value)])
    if (newStates.length)     onApplyStates([...currentStates, ...newStates.map((s) => s.value)])
    if (newRoles.length)      onApplyRoles([...currentRoles, ...newRoles.map((r) => r.value)])
  }

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-indigo-900">
              Leadkaun detected {suggestions.total_analyzed} leads in your pipeline
            </p>
            <p className="text-[11px] text-indigo-600 mt-0.5">
              {hasNew
                ? "Here are the top segments. Click to add them to your ICP."
                : "All detected segments are already in your ICP."}
              {suggestions.has_won_leads && (
                <span className="ml-1 inline-flex items-center gap-0.5 text-amber-600">
                  <Trophy className="w-3 h-3" /> = won deals
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasNew && expanded && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); applyAll() }}
              className="text-[12px] font-semibold text-indigo-700 bg-white border border-indigo-200 px-3 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              Apply all suggestions
            </button>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-indigo-400" /> : <ChevronDown className="w-4 h-4 text-indigo-400" />}
        </div>
      </div>

      {/* Body */}
      {expanded && hasNew && (
        <div className="px-5 pb-5 space-y-4 border-t border-indigo-100 pt-4">
          {newIndustries.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide">Industries in your leads</p>
              <div className="flex flex-wrap gap-2">
                {newIndustries.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => onApplyIndustries([...currentIndustries, item.value])}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-colors"
                  >
                    {item.value}
                    <span className="text-[10px] text-indigo-500">{item.total}</span>
                    {item.won > 0 && <Trophy className="w-3 h-3 text-amber-500" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {newStates.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide">States in your leads</p>
              <div className="flex flex-wrap gap-2">
                {newStates.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => onApplyStates([...currentStates, item.value])}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-colors"
                  >
                    {item.value}
                    <span className="text-[10px] text-indigo-500">{item.total}</span>
                    {item.won > 0 && <Trophy className="w-3 h-3 text-amber-500" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {newRoles.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide">Decision makers in your leads</p>
              <div className="flex flex-wrap gap-2">
                {newRoles.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => onApplyRoles([...currentRoles, item.value])}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-colors"
                  >
                    {item.value}
                    <span className="text-[10px] text-indigo-500">{item.total}</span>
                    {item.won > 0 && <Trophy className="w-3 h-3 text-amber-500" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Win insights card ─────────────────────────────────────────────────────────

function WinInsightsCard({ suggestions }: { suggestions: Suggestions }) {
  const wonIndustries = suggestions.industries.filter((i) => i.won > 0).slice(0, 4)
  const wonStates     = suggestions.states.filter((s) => s.won > 0).slice(0, 4)

  if (!suggestions.has_won_leads || (wonIndustries.length === 0 && wonStates.length === 0)) return null

  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-5 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4 text-amber-600" />
        <p className="text-[13px] font-semibold text-amber-900">Your winning segments</p>
        <span className="text-[11px] text-amber-600">— based on deals you&apos;ve closed</span>
      </div>
      <div className="flex flex-wrap gap-3">
        {wonIndustries.map((item) => (
          <div key={item.value} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-[12px]">
            <span className="font-medium text-amber-900">{item.value}</span>
            <span className="text-amber-500">{item.won} win{item.won !== 1 ? "s" : ""}</span>
            {item.won_value != null && item.won_value > 0 && (
              <span className="text-emerald-600 font-semibold">
                ₹{item.won_value >= 100000
                  ? `${(item.won_value / 100000).toFixed(1)}L`
                  : `${(item.won_value / 1000).toFixed(0)}K`}
              </span>
            )}
          </div>
        ))}
        {wonStates.map((item) => (
          <div key={item.value} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-[12px]">
            <span className="font-medium text-amber-900">{item.value}</span>
            <span className="text-amber-500">{item.won} win{item.won !== 1 ? "s" : ""}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-amber-600">
        These segments are already scoring higher in your pipeline. Make sure they&apos;re in your ICP to keep rewarding them.
      </p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IcpPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<IcpData>({ queryKey: ["icp-settings"], queryFn: fetchIcp })
  const { data: suggestions } = useQuery<Suggestions>({
    queryKey:  ["icp-suggestions"],
    queryFn:   fetchSuggestions,
    staleTime: 60_000,
  })

  const [industries,   setIndustries]   = useState<string[]>([])
  const [states,       setStates]       = useState<string[]>([])
  const [businessTypes, setBusinessTypes] = useState<string[]>([])
  const [roles,        setRoles]        = useState<string[]>([])
  const [budgetMin,    setBudgetMin]    = useState("")
  const [budgetMax,    setBudgetMax]    = useState("")
  const [salesCycle,   setSalesCycle]   = useState("")
  const [fitThreshold,    setFitThreshold]    = useState(60)
  const [intentThreshold, setIntentThreshold] = useState(50)

  const [banner,  setBanner]  = useState("")
  const [saving,  setSaving]  = useState(false)

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
        method:  "PUT",
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

      // Trigger a background regrade so leads reflect the new ICP immediately
      fetch("/api/admin/regrade", { method: "POST", credentials: "include" }).catch(() => {})

      setBanner(`Saved — ${json.data.updated} leads are being regraded`)
      qc.invalidateQueries({ queryKey: ["icp-settings"] })
      qc.invalidateQueries({ queryKey: ["leads"] })
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

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-semibold">Best Customers</h1>
          <span className="text-sm text-muted-foreground font-normal mt-0.5">(ICP Settings)</span>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-xl">
          Tell us who your best customers are — the industries, locations, and roles that close best.
          The more you define, the smarter your lead scoring gets.{" "}
          <span className="text-slate-500">All fields are optional.</span>
        </p>
      </div>

      {/* Suggestions panel */}
      {suggestions && suggestions.total_analyzed >= 5 && (
        <div className="mb-6 space-y-3">
          <SuggestionsPanel
            suggestions={suggestions}
            currentIndustries={industries}
            currentStates={states}
            currentRoles={roles}
            onApplyIndustries={setIndustries}
            onApplyStates={setStates}
            onApplyRoles={setRoles}
          />
          <WinInsightsCard suggestions={suggestions} />
        </div>
      )}

      {/* No-leads hint */}
      {suggestions && suggestions.total_analyzed < 5 && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <Lightbulb className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <p className="text-[13px] text-slate-500">
            Once you import leads, Leadkaun will automatically suggest industries and states based on what&apos;s in your pipeline.
          </p>
        </div>
      )}

      {/* Save banner */}
      {banner && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
          {banner}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">

        {/* Industries */}
        <div className="space-y-3">
          <div>
            <Label className="text-base font-medium">Target Industries</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Industries where your best customers come from</p>
          </div>
          <ToggleChips
            options={INDUSTRY_OPTIONS}
            selected={industries}
            onChange={setIndustries}
            suggestions={suggestions?.industries}
          />
        </div>

        {/* States */}
        <div className="space-y-3">
          <div>
            <Label className="text-base font-medium">Target States</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Geographies you sell into most effectively</p>
          </div>
          <ToggleChips
            options={STATE_OPTIONS}
            selected={states}
            onChange={setStates}
            suggestions={suggestions?.states}
          />
        </div>

        {/* Business Types */}
        <div className="space-y-3">
          <div>
            <Label className="text-base font-medium">Business Types</Label>
            <p className="text-xs text-muted-foreground mt-0.5">The type of business you typically close</p>
          </div>
          <ToggleChips
            options={BUSINESS_TYPE_OPTIONS}
            selected={businessTypes}
            onChange={setBusinessTypes}
          />
        </div>

        {/* Decision Maker Roles */}
        <div className="space-y-3">
          <div>
            <Label className="text-base font-medium">Decision Maker Roles</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Who in the company typically buys from you</p>
          </div>
          <ToggleChips
            options={ROLE_OPTIONS}
            selected={roles}
            onChange={setRoles}
            suggestions={suggestions?.roles}
          />
        </div>

        {/* Budget */}
        <div className="space-y-3">
          <div>
            <Label className="text-base font-medium">Budget Range (₹)</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Deal sizes you typically close — leads outside this range score lower</p>
          </div>
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
          <div>
            <Label className="text-base font-medium">Typical Sales Cycle</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Used to calibrate intent decay speed</p>
          </div>
          <Select value={salesCycle} onValueChange={(v) => setSalesCycle(v ?? "")}>
            <SelectTrigger className="w-60">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {SALES_CYCLE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
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
              A lead is flagged as Sales Qualified when both scores exceed these thresholds.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Fit Score Threshold</Label>
              <span className="text-sm font-medium tabular-nums">{fitThreshold}</span>
            </div>
            <input
              type="range" min={0} max={100} step={5}
              value={fitThreshold}
              onChange={(e) => setFitThreshold(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Lenient (0)</span><span>Strict (100)</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Intent Score Threshold</Label>
              <span className="text-sm font-medium tabular-nums">{intentThreshold}</span>
            </div>
            <input
              type="range" min={0} max={100} step={5}
              value={intentThreshold}
              onChange={(e) => setIntentThreshold(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Lenient (0)</span><span>Strict (100)</span>
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
