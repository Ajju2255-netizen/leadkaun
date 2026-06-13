import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

// Service role client — bypasses RLS. Server-side only. Never expose to client.
//
// Constructed LAZILY (not at module load): createClient() throws
// "supabaseUrl is required" when the env is absent, and this module is imported
// during `next build` page-data collection. Eager construction made the build
// depend on the Supabase env being present in every scope. The cached singleton
// is created on first real use instead.
let _admin: SupabaseClient<Database> | null = null

export function createSupabaseAdminClient(): SupabaseClient<Database> {
  if (!_admin) {
    _admin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    )
  }
  return _admin
}
