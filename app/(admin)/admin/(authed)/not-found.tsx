import Link from "next/link"
import { SearchX } from "lucide-react"

// The notFound() calls in the account / lead / workspace / intake detail pages
// used to fall through to the customer app's root not-found, which offers links
// into the product. Keep a 404 inside Mission Control pointing back at the panel.
export default function AdminNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center px-4">
      <div className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-200/70 flex items-center justify-center">
        <SearchX className="w-5 h-5 text-ink-muted" />
      </div>
      <div className="space-y-2">
        <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-ink">Not found</h2>
        <p className="text-[13px] text-ink-soft max-w-sm leading-relaxed">
          This record does not exist, or it was deleted. If you followed a link from a
          ticket or an older timeline entry, the underlying account may have been removed.
        </p>
      </div>
      <Link
        href="/"
        className="h-9 px-5 inline-flex items-center rounded-full border border-slate-200 bg-white
                   hover:bg-slate-50 text-[13px] font-semibold text-ink-soft transition-all active:scale-[0.97]"
      >
        Back to Overview
      </Link>
    </div>
  )
}
