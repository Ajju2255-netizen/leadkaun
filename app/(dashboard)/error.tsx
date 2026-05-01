"use client"

import { useEffect } from "react"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Dashboard error:", error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center px-4">
      <div className="space-y-2">
        <h2 className="text-[18px] font-bold text-slate-900">Something went wrong</h2>
        <p className="text-[13px] text-slate-500 max-w-sm leading-relaxed">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        {error.digest && (
          <p className="text-[11px] text-slate-400 font-mono">Error ID: {error.digest}</p>
        )}
      </div>
      <button
        onClick={reset}
        className="h-9 px-5 rounded-full border border-slate-200 bg-white hover:bg-slate-50
                   text-[13px] font-semibold text-slate-700 transition-all active:scale-[0.97]"
      >
        Try again
      </button>
    </div>
  )
}
