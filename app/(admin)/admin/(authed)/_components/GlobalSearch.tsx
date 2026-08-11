"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"

export function GlobalSearch() {
  const router = useRouter()
  const [q, setQ] = useState("")
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) router.push(`/admin/support?q=${encodeURIComponent(q.trim())}`) }}
      className="relative w-full max-w-lg"
    >
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search accounts, users, leads, phone, workspaces, imports…"
        className="w-full h-9 rounded-xl bg-white/80 border border-hairline-strong pl-9 pr-3 text-[12.5px] text-ink placeholder:text-ink-muted outline-none focus:border-sky-400"
      />
    </form>
  )
}
