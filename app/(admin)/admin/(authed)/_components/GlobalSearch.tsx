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
      className="relative w-full max-w-md"
    >
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search companies, users, leads…"
        className="w-full h-9 rounded-lg bg-slate-900/60 border border-white/10 pl-9 pr-3 text-[13px] text-white placeholder:text-slate-500 outline-none focus:border-violet-400"
      />
    </form>
  )
}
