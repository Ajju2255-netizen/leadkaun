import { serve } from "inngest/next"
import { inngest } from "@/inngest/client"
import { intentDecayFn } from "@/inngest/functions/intent-decay"
import { followUpOverdueFn } from "@/inngest/functions/follow-up-overdue"
import { morningBriefFn } from "@/inngest/functions/morning-brief"
import { missedOpportunityFn } from "@/inngest/functions/missed-opportunity"
import { sheetsSyncFn } from "@/inngest/functions/sheets-sync"
import { execScoreAlertFn } from "@/inngest/functions/exec-score-alert"

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    intentDecayFn,       // 5.1 — nightly intent decay
    followUpOverdueFn,   // 5.3 — follow-up overdue checker
    morningBriefFn,      // 5.4 — morning brief emails
    missedOpportunityFn, // 5.5 — missed opportunity checker
    sheetsSyncFn,        // 5.6 — Google Sheets sync
    execScoreAlertFn,    // 5.7 — daily execution score alert (3pm IST)
  ],
})
