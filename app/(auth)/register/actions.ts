"use server"

import { registerAccount, type RegisterInput, type RegisterResult } from "@/lib/auth/register-account"

export type { RegisterInput, RegisterResult }

/**
 * Server action wrapper for the /register page. The work lives in
 * lib/auth/register-account.ts so the marketing form's POST endpoint runs the
 * exact same path.
 */
export async function registerAction(input: RegisterInput): Promise<RegisterResult> {
  return registerAccount(input)
}
