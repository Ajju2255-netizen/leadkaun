import { createBrowserClient } from "@supabase/auth-helpers-nextjs"
import type { Database } from "@/types/database"

// Singleton browser client
let client: ReturnType<typeof createBrowserClient<Database>> | null = null

export function getSupabaseBrowserClient() {
  if (!client) {
    client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return client
}
