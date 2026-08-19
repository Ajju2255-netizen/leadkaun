"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import { Search, Building2, Users, Layers, Target, FileText, Upload, ArrowRight } from "lucide-react"

// Cross-tenant search over /api/admin/platform/search. This used to be a plain
// form that pushed to /support and full-page-navigated away — the placeholder
// promised results the box could not show. Same endpoint, same 250ms debounce,
// but the answer arrives in place.
//
// cmdk with shouldFilter={false}: the server has already matched and ranked, so
// client-side filtering would only fight it (it cannot see a phone number that
// matched on a normalised form). cmdk is here for keyboard nav and the listbox
// semantics, not for filtering.

type Hit = { id: string; primary: string; secondary: string | null; tag: string; href: string }
type Results = {
  accounts: Hit[]; users: Hit[]; workspaces: Hit[]
  leads: Hit[]; intakeSessions: Hit[]; imports: Hit[]; total: number
}

const GROUPS: { key: keyof Omit<Results, "total">; label: string; icon: typeof Building2 }[] = [
  { key: "accounts",       label: "Accounts",       icon: Building2 },
  { key: "users",          label: "Users",          icon: Users },
  { key: "workspaces",     label: "Workspaces",     icon: Layers },
  { key: "leads",          label: "Leads",          icon: Target },
  { key: "intakeSessions", label: "Intake sessions", icon: FileText },
  { key: "imports",        label: "Imports",        icon: Upload },
]

export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [res, setRes] = useState<Results | null>(null)
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)

  // ⌘K / Ctrl-K from anywhere in the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (!open) { setQ(""); setRes(null); setLoading(false) }
  }, [open])

  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); setLoading(false); return }
    setLoading(true)
    // Guard against out-of-order responses: a slow query for "de" must not
    // overwrite the results for "demo" typed after it.
    const mine = ++seq.current
    const t = setTimeout(async () => {
      const r = await fetch(`/api/admin/platform/search?q=${encodeURIComponent(q.trim())}`, {
        credentials: "include",
      }).then((x) => (x.ok ? x.json() : null)).catch(() => null)
      if (mine !== seq.current) return
      setRes(r as Results | null)
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const go = useCallback((href: string) => { setOpen(false); router.push(href) }, [router])

  const hasResults = !!res && res.total > 0

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative w-full max-w-lg h-9 flex items-center gap-2 rounded-xl border
                   border-hairline-strong bg-white pl-9 pr-2 text-left transition-colors
                   hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2
                   focus-visible:outline-sky-500"
        aria-label="Search accounts, users, leads, phone numbers, workspaces and imports"
        aria-keyshortcuts="Meta+K Control+K"
      >
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted" />
        <span className="flex-1 text-[12.5px] text-ink-muted truncate">
          Search accounts, users, leads, phone, workspaces, imports…
        </span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-slate-200
                        bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
          {/* Click-away. Not a <button>: cmdk owns the keyboard here, and Esc closes. */}
          <div
            className="absolute inset-0 bg-slate-900/25"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <Command
            shouldFilter={false}
            loop
            label="Search Mission Control"
            onKeyDown={(e) => { if (e.key === "Escape") setOpen(false) }}
            className="relative w-full max-w-xl rounded-2xl border border-slate-200/70 bg-white
                       shadow-[0_16px_48px_rgba(15,23,42,0.16)] overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 border-b border-hairline">
              <Search className="w-4 h-4 text-ink-muted shrink-0" />
              <Command.Input
                autoFocus
                value={q}
                onValueChange={setQ}
                placeholder="Search accounts, users, leads, phone, workspaces, imports…"
                className="flex-1 h-12 bg-transparent text-[13.5px] text-ink placeholder:text-ink-faint outline-none"
              />
              {loading && <span className="text-[11px] text-ink-muted shrink-0">Searching…</span>}
            </div>

            <Command.List className="max-h-[52vh] overflow-y-auto p-1.5">
              {q.trim().length < 2 && (
                <p className="px-3 py-6 text-center text-[12.5px] text-ink-muted">
                  Type at least two characters. Phone numbers match on any format.
                </p>
              )}

              {q.trim().length >= 2 && !loading && res && res.total === 0 && (
                <p className="px-3 py-6 text-center text-[12.5px] text-ink-muted">
                  Nothing matched “{q.trim()}”.
                </p>
              )}

              {hasResults && GROUPS.map(({ key, label, icon: Icon }) => {
                const hits = res![key]
                if (!hits?.length) return null
                return (
                  <Command.Group
                    key={key}
                    heading={
                      <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                        {label}
                      </span>
                    }
                    className="mb-1"
                  >
                    {hits.map((h) => (
                      <Command.Item
                        key={h.id}
                        value={`${key}-${h.id}`}
                        onSelect={() => go(h.href)}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer
                                   data-[selected=true]:bg-sky-50 transition-colors"
                      >
                        <Icon className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                        <span className="text-[12.5px] font-medium text-ink truncate">{h.primary}</span>
                        {h.secondary && (
                          <span className="text-[11.5px] text-ink-muted truncate">{h.secondary}</span>
                        )}
                        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-ink-faint shrink-0">
                          {h.tag}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )
              })}

              {hasResults && (
                <Command.Item
                  value="see-all"
                  onSelect={() => go(`/support?q=${encodeURIComponent(q.trim())}`)}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer border-t
                             border-hairline mt-1 pt-2.5 data-[selected=true]:bg-sky-50"
                >
                  <ArrowRight className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span className="text-[12.5px] font-semibold text-sky-600">
                    Open {res!.total === 1 ? "the 1 result" : `all ${res!.total} results`} in Support
                  </span>
                </Command.Item>
              )}
            </Command.List>
          </Command>
        </div>
      )}
    </>
  )
}
