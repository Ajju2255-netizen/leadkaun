"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Search } from "lucide-react"

type Results = {
  accounts: { id: string; name: string; industry: string }[]
  users: { accountId: string; name: string; email: string; role: string }[]
  leads: { id: string; accountId: string; name: string; company: string | null; phone: string }[]
  workspaces: { accountId: string; name: string }[]
}

function Row({ href, primary, secondary, tag }: { href: string; primary: string; secondary?: string; tag?: string }) {
  return (
    <Link href={href} className="flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.03] transition-colors">
      <span className="min-w-0">
        <span className="text-[13px] text-white">{primary}</span>
        {secondary && <span className="text-[12px] text-slate-500 ml-2">{secondary}</span>}
      </span>
      {tag && <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-400 shrink-0">{tag}</span>}
    </Link>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-4 py-2">{title}</p>
      <div className="divide-y divide-white/5">{children}</div>
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
        .then((x) => x.json()).catch(() => null)
      setRes(r as Results | null); setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const empty = res && res.accounts.length + res.users.length + res.leads.length + res.workspaces.length === 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">Support</h1>
        <p className="text-[13px] text-slate-400 mt-1">Find any company, user, lead or workspace — opens the Company 360.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search company, email, phone, lead, workspace…"
          className="w-full h-11 rounded-xl bg-slate-900/60 border border-white/10 pl-10 pr-3 text-[14px] text-white outline-none focus:border-violet-400"
        />
      </div>

      {loading && <p className="text-[13px] text-slate-500">Searching…</p>}
      {empty && <p className="text-[13px] text-slate-500">No matches for “{q}”.</p>}

      {res && !empty && (
        <div className="rounded-2xl border border-white/10 overflow-hidden divide-y divide-white/10">
          {res.accounts.length > 0 && (
            <Group title="Companies">
              {res.accounts.map((a) => <Row key={a.id} href={`/admin/customers/${a.id}`} primary={a.name} secondary={a.industry} tag="company" />)}
            </Group>
          )}
          {res.users.length > 0 && (
            <Group title="Users">
              {res.users.map((u, i) => <Row key={i} href={`/admin/customers/${u.accountId}`} primary={u.name || u.email} secondary={u.email} tag={u.role} />)}
            </Group>
          )}
          {res.leads.length > 0 && (
            <Group title="Leads">
              {res.leads.map((l) => <Row key={l.id} href={`/admin/customers/${l.accountId}`} primary={l.name} secondary={[l.company, l.phone].filter(Boolean).join(" · ")} tag="lead" />)}
            </Group>
          )}
          {res.workspaces.length > 0 && (
            <Group title="Workspaces">
              {res.workspaces.map((w, i) => <Row key={i} href={`/admin/customers/${w.accountId}`} primary={w.name} tag="workspace" />)}
            </Group>
          )}
        </div>
      )}
    </div>
  )
}

export default function SupportPage() {
  return <Suspense><SupportInner /></Suspense>
}
