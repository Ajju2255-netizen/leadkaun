import { serve } from "inngest/next"
import { inngest } from "@/inngest/client"
import { intentDecayFn } from "@/inngest/functions/intent-decay"
import { icpRegradeFn } from "@/inngest/functions/icp-regrade"
import { followUpOverdueFn } from "@/inngest/functions/follow-up-overdue"
import { morningBriefFn } from "@/inngest/functions/morning-brief"
import { missedOpportunityFn } from "@/inngest/functions/missed-opportunity"
import { sheetsSyncFn } from "@/inngest/functions/sheets-sync"
import { execScoreAlertFn } from "@/inngest/functions/exec-score-alert"
import { adminDailyInsightsFn } from "@/inngest/functions/admin-daily-insights"

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    intentDecayFn,        // 5.1 — nightly intent decay
    icpRegradeFn,         // regrade all leads when ICP changes
    followUpOverdueFn,    // 5.3 — follow-up overdue checker
    morningBriefFn,       // 5.4 — morning brief emails
    missedOpportunityFn,  // 5.5 — missed opportunity checker
    sheetsSyncFn,         // 5.6 — Google Sheets sync
    execScoreAlertFn,     // 5.7 — daily execution score alert (3pm IST)
    adminDailyInsightsFn, // Mission Control daily digest (07:30 IST)
  ],
})
