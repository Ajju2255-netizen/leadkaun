"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"

// Without this, a thrown Prisma query anywhere in Mission Control falls through
// to the framework's default error page — and in production that is a blank
// screen with a digest and no way back. Mirrors app/(dashboard)/error.tsx.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Mission Control error:", error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center px-4">
      <div className="w-11 h-11 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center">
        <AlertTriangle className="w-5 h-5 text-red-500" />
      </div>
      <div className="space-y-2">
        <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-ink">
          This screen failed to load
        </h2>
        <p className="text-[13px] text-ink-soft max-w-sm leading-relaxed">
          {error.message || "An unexpected error occurred while querying the platform database."}
        </p>
        {error.digest && (
          <p className="text-[11px] text-ink-muted font-mono">Error ID: {error.digest}</p>
        )}
      </div>
      <button
        onClick={reset}
        className="h-9 px-5 rounded-full border border-slate-200 bg-white hover:bg-slate-50
                   text-[13px] font-semibold text-ink-soft transition-all active:scale-[0.97]"
      >
        Try again
      </button>
    </div>
  )
}
