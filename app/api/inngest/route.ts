import { serve } from "inngest/next"
import { inngest } from "@/inngest/client"

// All Inngest functions registered here — add to this array as they are built
const allFunctions: Parameters<typeof serve>[0]["functions"] = []

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: allFunctions,
})
