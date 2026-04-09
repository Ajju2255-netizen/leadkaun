import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/session"

/**
 * GET /api/auth/user
 * Returns the current authenticated user + account for client components.
 * Used by the useCurrentUser React Query hook.
 */
export async function GET() {
  const session = await getServerSession()

  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "AUTH_ERROR" }, { status: 401 })
  }

  return NextResponse.json(session)
}
