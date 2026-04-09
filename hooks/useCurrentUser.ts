import { useQuery } from "@tanstack/react-query"
import type { AuthSession } from "@/lib/auth/session"

async function fetchCurrentUser(): Promise<AuthSession> {
  const res = await fetch("/api/auth/user")
  if (!res.ok) throw new Error("Not authenticated")
  return res.json()
}

export function useCurrentUser() {
  return useQuery<AuthSession>({
    queryKey: ["auth", "user"],
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000,  // 5 min — user/role doesn't change often
    retry: false,               // don't retry auth failures
  })
}

/** Convenience: returns true if the user has one of the given roles */
export function useHasRole(...roles: AuthSession["user"]["role"][]) {
  const { data } = useCurrentUser()
  if (!data) return false
  return roles.includes(data.user.role)
}
