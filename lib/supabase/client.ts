import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import type { Database } from "@/types/database"

// Singleton browser client — safe to call multiple times
let client: ReturnType<typeof createClientComponentClient<Database>> | null = null

export function createBrowserClient() {
  if (!client) {
    client = createClientComponentClient<Database>()
  }
  return client
}
