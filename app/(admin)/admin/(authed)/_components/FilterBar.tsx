"use client"

import { useCallback, useState, useTransition, useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Search, X } from "lucide-react"
import { Button, Input, Select } from "./ui"

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

  return (
    <div
      role="search"
      aria-busy={pending}
      className={`flex items-center gap-2 flex-wrap ${pending ? "opacity-60" : ""} transition-opacity`}
    >
      {showSearch && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted" />
          <Input
            size="sm"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            className="w-56 pl-8"
          />
        </div>
      )}

      {filters.map((f) => (
        <Select
          key={f.param}
          size="sm"
          value={sp.get(f.param) ?? ""}
          onChange={(e) => push(f.param, e.target.value)}
          // The visible "label" is only the placeholder <option>, so once a
          // filter is applied the control has no accessible name at all.
          aria-label={`Filter by ${f.label}`}
          className={sp.get(f.param) ? "border-sky-400 text-sky-700 font-semibold" : ""}
        >
          <option value="">{f.label}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      ))}

      {active > 0 && (
        <Button
          size="sm"
          onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))}
          aria-label={`Clear ${active} active ${active === 1 ? "filter" : "filters"}`}
        >
          <X className="w-3 h-3" /> Clear {active}
        </Button>
      )}
    </div>
  )
}
