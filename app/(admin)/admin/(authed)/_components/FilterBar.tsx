"use client"

import { useCallback, useState, useTransition, useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Search, X } from "lucide-react"

export type SelectFilter = {
  param: string
  label: string
  options: { value: string; label: string }[]
}

/**
 * URL-driven filters for the admin tables. Every filter lives in the query
 * string so a filtered view is a shareable link — support can paste "the seven
 * at-risk accounts" into a thread instead of describing how to reproduce it.
 */
export function FilterBar({
  filters,
  searchParam = "q",
  searchPlaceholder = "Search…",
  showSearch = true,
}: {
  filters: SelectFilter[]
  searchParam?: string
  searchPlaceholder?: string
  showSearch?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [q, setQ] = useState(sp.get(searchParam) ?? "")

  // Keep the input in sync when the URL changes from outside (back button, a
  // "clear all" click) without fighting the user mid-type.
  useEffect(() => { setQ(sp.get(searchParam) ?? "") }, [sp, searchParam])

  const push = useCallback(
    (param: string, value: string) => {
      const next = new URLSearchParams(sp.toString())
      if (value) next.set(param, value)
      else next.delete(param)
      startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }))
    },
    [sp, pathname, router],
  )

  // Debounce the free-text box; the selects apply immediately.
  useEffect(() => {
    if (!showSearch) return
    const current = sp.get(searchParam) ?? ""
    if (q === current) return
    const t = setTimeout(() => push(searchParam, q), 300)
    return () => clearTimeout(t)
  }, [q, sp, searchParam, push, showSearch])

  const active = filters.filter((f) => sp.get(f.param)).length + (sp.get(searchParam) ? 1 : 0)

  const sel =
    "h-8 rounded-lg bg-white/80 border border-hairline-strong px-2 text-[12px] text-ink outline-none focus:border-sky-400 cursor-pointer"

  return (
    <div className={`flex items-center gap-2 flex-wrap ${pending ? "opacity-60" : ""} transition-opacity`}>
      {showSearch && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 w-56 rounded-lg bg-white/80 border border-hairline-strong pl-8 pr-2 text-[12px] text-ink placeholder:text-ink-muted outline-none focus:border-sky-400"
          />
        </div>
      )}

      {filters.map((f) => (
        <select
          key={f.param}
          value={sp.get(f.param) ?? ""}
          onChange={(e) => push(f.param, e.target.value)}
          className={`${sel} ${sp.get(f.param) ? "border-sky-400 text-sky-700 font-semibold" : ""}`}
        >
          <option value="">{f.label}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ))}

      {active > 0 && (
        <button
          onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))}
          className="h-8 inline-flex items-center gap-1 rounded-lg border border-hairline-strong bg-white/80 px-2.5 text-[11.5px] font-semibold text-ink-soft hover:text-ink hover:border-slate-300"
        >
          <X className="w-3 h-3" /> Clear {active}
        </button>
      )}
    </div>
  )
}
