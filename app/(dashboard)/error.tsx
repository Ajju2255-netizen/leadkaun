"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

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
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">Error ID: {error.digest}</p>
        )}
      </div>
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </div>
  )
}
