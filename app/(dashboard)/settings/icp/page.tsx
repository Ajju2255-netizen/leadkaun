"use client"

import { useState, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { Lightbulb, Trophy, ChevronDown, ChevronUp, Sparkles, Target, Save } from "lucide-react"
import { ThemedSelect } from "@/components/shared/ThemedSelect"

// ── Options ───────────────────────────────────────────────────────────────────

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

// ── Types ─────────────────────────────────────────────────────────────────────

interface IcpData {
  icp_configured:       boolean
  icp_industries:       string[]
  icp_states:           string[]
  icp_business_types:   string[]
  icp_roles:            string[]
  icp_budget_min:       number | null
  icp_budget_max:       number | null
  icp_sales_cycle:      string | null
  sql_fit_threshold:    number
  sql_intent_threshold: number
}

interface SuggestionItem {
  value:      string
  total:      number
  won:        number
  won_value?: number
}

interface Suggestions {
  industries:    SuggestionItem[]
  states:        SuggestionItem[]
  roles:         SuggestionItem[]
  has_won_leads: boolean
  total_analyzed:number
}

async function fetchIcp(): Promise<IcpData> {
  const res = await fetch("/api/settings/icp")
  if (!res.ok) throw new Error("Failed to fetch ICP")
  // API returns { icp: ... } directly via apiSuccess({icp: account}) — no .data envelope
  return res.json().then((r) => r.icp ?? r.data?.icp)
}

async function fetchSuggestions(): Promise<Suggestions> {
  const res = await fetch("/api/settings/icp/suggestions")
  if (!res.ok) throw new Error("Failed to fetch suggestions")
  // API returns suggestions object directly — accept both shapes for safety
  return res.json().then((r) => r?.data ?? r)
}

// ── Toggle chips ──────────────────────────────────────────────────────────────

function ToggleChips({
  options,
  selected,
  onChange,
  suggestions,
}: {
  options:      string[]
  selected:     string[]
  onChange:     (v: string[]) => void
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
              inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all
              ${active
                ? "bg-sky-600 text-white border-sky-600 shadow-[0_1px_2px_rgba(14, 165, 233,0.25)]"
                : "bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:text-sky-700 hover:bg-sky-50"
              }
            `}
          >
            {opt}
            {sug && sug.total > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
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
    <div className="rounded-xl border border-sky-100 bg-sky-50/60 overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-sky-50/80 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-sky-900">
              Leadkaun detected {suggestions.total_analyzed} leads in your pipeline
            </p>
            <p className="text-[11px] text-sky-600 mt-0.5">
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
              className="text-[12px] font-semibold text-sky-700 bg-white border border-sky-200 px-3 py-1 rounded-full hover:bg-sky-50 transition-colors"
            >
              Apply all
            </button>
          )}
          {expanded
            ? <ChevronUp className="w-4 h-4 text-sky-400" />
            : <ChevronDown className="w-4 h-4 text-sky-400" />}
        </div>
      </div>

      {expanded && hasNew && (
        <div className="px-5 pb-5 space-y-4 border-t border-sky-100 pt-4">
          {newIndustries.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-sky-500 uppercase tracking-widest">Industries in your leads</p>
              <div className="flex flex-wrap gap-2">
                {newIndustries.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => onApplyIndustries([...currentIndustries, item.value])}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold
                               bg-white border border-sky-200 text-sky-800
                               hover:bg-sky-600 hover:text-white hover:border-sky-600 transition-all"
                  >
                    {item.value}
                    <span className="text-[10px] opacity-70">{item.total}</span>
                    {item.won > 0 && <Trophy className="w-3 h-3 text-amber-500" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {newStates.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-sky-500 uppercase tracking-widest">States in your leads</p>
              <div className="flex flex-wrap gap-2">
                {newStates.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => onApplyStates([...currentStates, item.value])}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold
                               bg-white border border-sky-200 text-sky-800
                               hover:bg-sky-600 hover:text-white hover:border-sky-600 transition-all"
                  >
                    {item.value}
                    <span className="text-[10px] opacity-70">{item.total}</span>
                    {item.won > 0 && <Trophy className="w-3 h-3 text-amber-500" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {newRoles.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-sky-500 uppercase tracking-widest">Decision makers in your leads</p>
              <div className="flex flex-wrap gap-2">
                {newRoles.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => onApplyRoles([...currentRoles, item.value])}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold
                               bg-white border border-sky-200 text-sky-800
                               hover:bg-sky-600 hover:text-white hover:border-sky-600 transition-all"
                  >
                    {item.value}
                    <span className="text-[10px] opacity-70">{item.total}</span>
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
        <div className="w-7 h-7 rounded-xl bg-amber-100 flex items-center justify-center">
          <Trophy className="w-3.5 h-3.5 text-amber-600" />
        </div>
        <p className="text-[13px] font-bold text-amber-900">Your winning segments</p>
        <span className="text-[11px] text-amber-600">— based on deals you&apos;ve closed</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {wonIndustries.map((item) => (
          <div key={item.value} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-amber-200 text-[12px]">
            <span className="font-semibold text-amber-900">{item.value}</span>
            <span className="text-amber-500">{item.won} win{item.won !== 1 ? "s" : ""}</span>
            {item.won_value != null && item.won_value > 0 && (
              <span className="text-emerald-600 font-bold">
                ₹{item.won_value >= 100_000
                  ? `${(item.won_value / 100_000).toFixed(1)}L`
                  : `${(item.won_value / 1_000).toFixed(0)}K`}
              </span>
            )}
          </div>
        ))}
        {wonStates.map((item) => (
          <div key={item.value} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-amber-200 text-[12px]">
            <span className="font-semibold text-amber-900">{item.value}</span>
            <span className="text-amber-500">{item.won} win{item.won !== 1 ? "s" : ""}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-amber-600 leading-relaxed">
        These segments are already scoring higher. Make sure they&apos;re in your ICP to keep rewarding them.
      </p>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="glass-card px-5 py-4 space-y-3">
      <div>
        <p className="text-[14px] font-bold text-slate-900">{title}</p>
        <p className="text-[12px] text-slate-400 mt-0.5">{desc}</p>
      </div>
      {children}
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

  const [industries,    setIndustries]    = useState<string[]>([])
  const [states,        setStates]        = useState<string[]>([])
  const [businessTypes, setBusinessTypes] = useState<string[]>([])
  const [roles,         setRoles]         = useState<string[]>([])
  const [budgetMin,     setBudgetMin]     = useState("")
  const [budgetMax,     setBudgetMax]     = useState("")
  const [salesCycle,    setSalesCycle]    = useState("")
  const [fitThreshold,    setFitThreshold]    = useState(60)
  const [intentThreshold, setIntentThreshold] = useState(50)
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

      // Background regrade
      fetch("/api/admin/regrade", { method: "POST", credentials: "include" }).catch(() => {})

      toast.success(`Saved — ${json.data.updated} leads are being regraded`)
      qc.invalidateQueries({ queryKey: ["icp-settings"] })
      qc.invalidateQueries({ queryKey: ["leads"] })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_18px_rgba(14,165,233,0.32)] shrink-0">
          <Target className="w-6 h-6 text-white" strokeWidth={2.4} />
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-[28px] font-bold text-ink tracking-[-0.02em] leading-tight">Best Customers</h1>
            <span className="text-[13px] text-slate-400 font-normal">ICP Settings</span>
          </div>
          <p className="text-[13px] text-slate-500 mt-0.5 leading-relaxed max-w-xl">
            Tell us who your best customers are — the industries, locations, and roles that close best.
            The more you define, the smarter your lead scoring gets.
          </p>
        </div>
      </div>

      {/* ── Suggestions panel ────────────────────────────────────────── */}
      {suggestions && suggestions.total_analyzed >= 5 && (
        <div className="space-y-3">
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

      {/* ── No-leads hint ────────────────────────────────────────────── */}
      {suggestions && suggestions.total_analyzed < 5 && (
        <div className="glass-card flex items-start gap-3 px-4 py-3.5">
          <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
            <Lightbulb className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <p className="text-[13px] text-slate-500 leading-relaxed">
            Once you import leads, Leadkaun will automatically suggest industries and states based on what&apos;s in your pipeline.
          </p>
        </div>
      )}

      {/* ── Form ─────────────────────────────────────────────────────── */}
      <form onSubmit={handleSave} className="space-y-4">

        <Section title="Target Industries" desc="Industries where your best customers come from">
          <ToggleChips
            options={INDUSTRY_OPTIONS}
            selected={industries}
            onChange={setIndustries}
            suggestions={suggestions?.industries}
          />
        </Section>

        <Section title="Target States" desc="Geographies you sell into most effectively">
          <ToggleChips
            options={STATE_OPTIONS}
            selected={states}
            onChange={setStates}
            suggestions={suggestions?.states}
          />
        </Section>

        <Section title="Business Types" desc="The type of business you typically close">
          <ToggleChips
            options={BUSINESS_TYPE_OPTIONS}
            selected={businessTypes}
            onChange={setBusinessTypes}
          />
        </Section>

        <Section title="Decision Maker Roles" desc="Who in the company typically buys from you">
          <ToggleChips
            options={ROLE_OPTIONS}
            selected={roles}
            onChange={setRoles}
            suggestions={suggestions?.roles}
          />
        </Section>

        <Section title="Budget Range (₹)" desc="Deal sizes you typically close — leads outside this range score lower">
          <div className="flex gap-3 items-center">
            <div className="flex-1 space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Min</p>
              <input
                type="number"
                placeholder="e.g. 50000"
                value={budgetMin}
                onChange={(e) => setBudgetMin(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-900
                           placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/30
                           focus:border-sky-400 transition-all"
              />
            </div>
            <span className="text-slate-300 mt-5 text-lg">—</span>
            <div className="flex-1 space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Max</p>
              <input
                type="number"
                placeholder="e.g. 500000"
                value={budgetMax}
                onChange={(e) => setBudgetMax(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-900
                           placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/30
                           focus:border-sky-400 transition-all"
              />
            </div>
          </div>
        </Section>

        <Section title="Typical Sales Cycle" desc="Used to calibrate intent decay speed">
          <ThemedSelect
            value={salesCycle}
            onValueChange={setSalesCycle}
            options={SALES_CYCLE_OPTIONS}
            placeholder="Select…"
            className="w-60"
            aria-label="Typical sales cycle"
          />
        </Section>

        {/* SQL Thresholds */}
        <div className="glass-card px-5 py-4 space-y-5">
          <div className="border-b border-slate-100 pb-4">
            <p className="text-[14px] font-bold text-slate-900">SQL Thresholds</p>
            <p className="text-[12px] text-slate-400 mt-0.5">
              A lead is flagged as Sales Qualified when both scores exceed these thresholds.
            </p>
          </div>

          {/* Fit threshold */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold text-slate-800">Fit Score Threshold</p>
                <p className="text-[11px] text-slate-400">How well the lead matches your ICP</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
                <span className="text-[14px] font-black text-sky-600 tabular-nums">{fitThreshold}</span>
              </div>
            </div>
            <input
              type="range" min={0} max={100} step={5}
              value={fitThreshold}
              onChange={(e) => setFitThreshold(parseInt(e.target.value))}
              className="w-full h-1.5 rounded-full accent-sky-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-medium">
              <span>Lenient (0)</span><span>Strict (100)</span>
            </div>
          </div>

          {/* Intent threshold */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold text-slate-800">Intent Score Threshold</p>
                <p className="text-[11px] text-slate-400">Engagement signals and buying intent</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
                <span className="text-[14px] font-black text-sky-600 tabular-nums">{intentThreshold}</span>
              </div>
            </div>
            <input
              type="range" min={0} max={100} step={5}
              value={intentThreshold}
              onChange={(e) => setIntentThreshold(parseInt(e.target.value))}
              className="w-full h-1.5 rounded-full accent-sky-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-medium">
              <span>Lenient (0)</span><span>Strict (100)</span>
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 h-11 px-6 rounded-full bg-gradient-to-b from-sky-400 to-sky-500 hover:from-sky-500 hover:to-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_12px_rgba(14,165,233,0.32)]
                       text-white text-[14px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed
                       active:scale-[0.97] transition-all
                       shadow-[0_2px_8px_rgba(14, 165, 233,0.3),inset_0_1px_0_rgba(255,255,255,0.12)]"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save & Regrade Leads"}
          </button>
        </div>
      </form>
    </div>
  )
}
