"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { FlaskConical, ArrowRight } from "lucide-react"

import { useCurrentUser } from "@/hooks/useCurrentUser"
import { SAMPLE_WORKSPACE_SLUG } from "@/lib/workspace/provision"

/**
 * Shown on every screen while the Sample workspace is active.
 *
 * A demo that looks identical to the real product is worse than no demo: a user
 * could reasonably conclude Leadkaun had already imported their leads. So the
 * sample announces itself everywhere, and the way out is always one click.
 *
 * The CTA hierarchy is deliberate — importing real leads is the primary action,
 * exploring the sample is the fallback. This banner never becomes the
 * destination.
 */
export function SampleWorkspaceBanner() {
  const { data: session } = useCurrentUser()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [removing, setRemoving] = useState(false)

  const inSample = session?.workspace?.slug === SAMPLE_WORKSPACE_SLUG
  if (!inSample) return null

  const mainWorkspace = session?.workspaces?.find((w) => w.slug !== SAMPLE_WORKSPACE_SLUG)

  async function switchToMainThen(path: string) {
    if (mainWorkspace) {
      await fetch("/api/workspaces/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ workspace_id: mainWorkspace.id }),
      }).catch(() => {})
    }
    await queryClient.invalidateQueries()
    router.push(path)
    router.refresh()
  }

  async function removeSample() {
    setRemoving(true)
    try {
      const res = await fetch("/api/workspaces/sample", { method: "DELETE", credentials: "include" })
      if (!res.ok) throw new Error()
      toast.success("Example leads removed")
      await switchToMainThen("/queue")
    } catch {
      toast.error("Couldn't remove the sample. Please try again.")
      setRemoving(false)
    }
  }

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 md:px-6"
      style={{ background: "rgba(234,88,12,0.08)", borderBottom: "1px solid rgba(234,88,12,0.20)" }}
    >
      <span className="inline-flex items-center gap-2 shrink-0">
        <FlaskConical className="w-4 h-4 text-orange-600" strokeWidth={2} />
        <span className="text-[12.5px] font-semibold text-orange-700">Sample workspace</span>
      </span>

      <span className="text-[12.5px] text-ink-soft min-w-0">
        These are example leads, not yours — they&apos;re here so you can see how Leadkaun works.
      </span>

      <span className="flex items-center gap-2 ml-auto shrink-0">
        <button
          onClick={() => switchToMainThen("/leads/import")}
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-gradient-to-b from-sky-400 to-sky-500
                     hover:from-sky-500 hover:to-sky-600 text-white text-[12px] font-semibold transition-all active:scale-[0.97]"
        >
          Import my leads <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={removeSample}
          disabled={removing}
          className="h-8 px-3 rounded-full text-[12px] font-medium text-ink-muted hover:text-ink-soft disabled:opacity-50 transition-colors"
        >
          {removing ? "Removing…" : "Remove sample"}
        </button>
      </span>
    </div>
  )
}
