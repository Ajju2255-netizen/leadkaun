import type { QueryClient } from "@tanstack/react-query"

import { SAMPLE_WORKSPACE_SLUG } from "@/lib/workspace/provision"
import type { SessionWorkspace } from "@/lib/auth/session"

/**
 * Switching the active workspace, from the client.
 *
 * There were three copies of this and they did not agree. The sample banner
 * switched and invalidated the query cache; the sidebar switched and only
 * called router.refresh(), so useCurrentUser (staleTime five minutes) and
 * useQueue (whose key is not workspace scoped) kept serving the workspace the
 * user had just left; the onboarding page switched with neither. Invalidating
 * is not optional here, so it lives inside the one function everybody calls.
 */
export async function switchWorkspace(workspaceId: string, queryClient: QueryClient): Promise<void> {
  await fetch("/api/workspaces/switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ workspace_id: workspaceId }),
  }).catch(() => {
    /* A failed switch leaves the cookie alone; the caller still refreshes and
       the UI keeps showing the workspace it is actually in. Never throw into a
       navigation handler. */
  })
  await queryClient.invalidateQueries()
}

/** True when this workspace holds the seeded example leads, not the user's. */
export function isSample(workspace: SessionWorkspace | null | undefined): boolean {
  return workspace?.slug === SAMPLE_WORKSPACE_SLUG
}

/**
 * The workspace a real import belongs in.
 *
 * Prefers the account default, which is "Main" for every account created by
 * registration, and falls back to any workspace that is not the sample. Returns
 * null only if the sample is somehow the only one, in which case the caller
 * must refuse to import rather than guess.
 */
export function realWorkspace(workspaces: SessionWorkspace[] | undefined): SessionWorkspace | null {
  if (!workspaces?.length) return null
  const notSample = workspaces.filter((w) => w.slug !== SAMPLE_WORKSPACE_SLUG)
  if (!notSample.length) return null
  return notSample.find((w) => w.isDefault) ?? notSample[0]
}
