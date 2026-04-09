import { NextResponse } from "next/server"
import type { ZodSchema } from "zod"

// ─────────────────────────────────────────────
// Standard response shapes
// ─────────────────────────────────────────────

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}

export function apiError(
  message: string,
  code: string,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 500 = 400,
) {
  return NextResponse.json({ error: message, code }, { status })
}

// ─────────────────────────────────────────────
// Zod request body validation
// ─────────────────────────────────────────────

export async function parseBody<T>(
  req: Request,
  schema: ZodSchema<T>,
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return { data: null, error: apiError("Invalid JSON body", "INVALID_JSON", 400) }
  }

  const result = schema.safeParse(raw)
  if (!result.success) {
    const message = result.error.issues.map((e) => `${String(e.path.join("."))}: ${e.message}`).join("; ")
    return { data: null, error: apiError(message, "VALIDATION_ERROR", 422) }
  }

  return { data: result.data, error: null }
}

// ─────────────────────────────────────────────
// Common error codes
// ─────────────────────────────────────────────

export const NOT_FOUND = (resource = "Resource") =>
  apiError(`${resource} not found`, "NOT_FOUND", 404)

export const FORBIDDEN = () =>
  apiError("You do not have permission to perform this action", "FORBIDDEN", 403)

export const CONFLICT = (message: string) =>
  apiError(message, "CONFLICT", 409)
