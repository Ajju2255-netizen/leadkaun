"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Search, ArrowRight } from "lucide-react"

type Hit = { id: string; primary: string; secondary: string | null; tag: string; href: string }
type Results = {
  accounts: Hit[]
  users: Hit[]
  workspaces: Hit[]
  leads: Hit[]
  intakeSessions: Hit[]
  imports: Hit[]
  total: number
}

const TAG_CLASS: Record<string, string> = {
  account: "bg-sky-50 text-sky-700 border-sky-200/70",
  user: "bg-violet-50 text-violet-700 border-violet-200/70",
  workspace: "bg-slate-100 text-slate-600 border-slate-200",
  lead: "bg-emerald-50 text-emerald-700 border-emerald-200/70",
  intake: "bg-orange-50 text-orange-700 border-orange-200/70",
  import: "bg-orange-50 text-orange-700 border-orange-200/70",
}

function Row({ hit }: { hit: Hit }) {
  return (
    <Link href={hit.href} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-sky-50/60 transition-colors">
      <span className="min-w-0">
        <span className="text-[13px] font-semibold text-ink">{hit.primary}</span>
        {hit.secondary && <span className="text-[11.5px] text-ink-muted ml-2">{hit.secondary}</span>}
      </span>
      <span className="flex items-center gap-2 shrink-0">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TAG_CLASS[hit.tag] ?? TAG_CLASS.workspace}`}>
          {hit.tag}
        </span>
        <ArrowRight className="w-3.5 h-3.5 text-ink-faint" />
      </span>
    </Link>
  )
}

function Group({ title, hits }: { title: string; hits: Hit[] }) {
  if (hits.length === 0) return null
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-wider text-ink-muted px-4 py-2 bg-slate-900/[0.03]">{title}</p>
      <div className="divide-y divide-hairline">
        {hits.map((h) => <Row key={`${h.tag}-${h.id}`} hit={h} />)}
      </div>
    </div>
  )
}

function SupportInner() {
  const sp = useSearchParams()
  const [q, setQ] = useState(sp.get("q") ?? "")
  const [res, setRes] = useState<Results | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return }
    setLoading(true)
    const t = setTimeout(async () => {
      const r = await fetch(`/api/admin/platform/search?q=${encodeURIComponent(q)}`, { credentials: "include" })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null)
      setRes(r as Results | null)
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const empty = res != null && res.total === 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-black tracking-tight text-ink">Support</h1>
        <p className="text-[13px] text-ink-soft mt-1 max-w-2xl">
          One box for the whole story. Search a company, an email, a phone number, a lead, a workspace, a filename, a
          column signature — or paste any id straight out of a log. Every result opens the screen that continues the
          investigation.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
        <input
          autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Company, email, phone, lead, workspace, filename, or an id…"
          className="w-full h-12 rounded-2xl bg-white/85 border border-hairline-strong pl-11 pr-3 text-[14px] text-ink placeholder:text-ink-muted outline-none focus:border-sky-400 shadow-card"
        />
      </div>

      {loading && <p className="text-[13px] text-ink-muted">Searching…</p>}
      {empty && (
        <p className="text-[13px] text-ink-muted">
          No matches for &ldquo;{q}&rdquo;. Phone numbers are stored normalised as <code>+91…</code>, but a bare
          10-digit number will still match.
        </p>
      )}

      {res && res.total > 0 && (
        <div className="rounded-2xl glass-2 overflow-hidden divide-y divide-hairline">
          <Group title="Accounts" hits={res.accounts} />
          <Group title="Leads" hits={res.leads} />
          <Group title="Users" hits={res.users} />
          <Group title="Workspaces" hits={res.workspaces} />
          <Group title="Intake sessions" hits={res.intakeSessions} />
          <Group title="Imports" hits={res.imports} />
        </div>
      )}

      {!res && !loading && (
        <div className="rounded-2xl glass-2 px-5 py-4">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-2">
            Reconstructing &ldquo;Leadkaun gave this lead a bad recommendation&rdquo;
          </p>
          <ol className="space-y-1.5 text-[12.5px] text-ink-soft">
            <li><span className="font-bold text-ink">1.</span> Search the lead&rsquo;s phone number → open the Lead Inspector.</li>
            <li><span className="font-bold text-ink">2.</span> Read <em>Why this grade</em> — the customer&rsquo;s view on the left, the raw engine output and a live re-computation on the right.</li>
            <li><span className="font-bold text-ink">3.</span> Check <em>Confidence</em>. If it is under 50, the grade was provisional and the real answer is missing data, not bad scoring.</li>
            <li><span className="font-bold text-ink">4.</span> Read the <em>Recommendation history</em> — what was shown, at what grade, and the reason the rep gave for skipping.</li>
            <li><span className="font-bold text-ink">5.</span> Follow the <em>Signals</em> table to the exact event that moved intent.</li>
            <li><span className="font-bold text-ink">6.</span> If the data looks wrong at the root, open the intake session that imported the lead and read the report the customer approved.</li>
          </ol>
        </div>
      )}
    </div>
  )
}

export default function SupportPage() {
  return <Suspense><SupportInner /></Suspense>
}
