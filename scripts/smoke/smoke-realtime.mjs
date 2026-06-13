// Realtime smoke test (B3): browser subscribes (AlertListener) → server HTTP
// broadcast → sonner toast. Needs dev server :3000 with DEV_AUTH_BYPASS.
import { readFileSync } from "fs"
import { chromium } from "@playwright/test"
for (const line of readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?/); if (m) process.env[m[1]] = m[2]
}
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY
const bc = (userId, event, payload) => fetch(`${SUPA}/realtime/v1/api/broadcast`, {
  method: "POST", headers: { "Content-Type": "application/json", apikey: SVC, Authorization: `Bearer ${SVC}` },
  body: JSON.stringify({ messages: [{ topic: `alerts:${userId}`, event, payload }] }),
}).then(r => r.status)

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
await page.goto("http://localhost:3000/queue", { waitUntil: "networkidle", timeout: 30000 })
const me = await page.evaluate(() => fetch("/api/auth/user", { credentials: "include" }).then(r => r.json()))
const uid = me.user.id
console.log(`subscribed user: ${uid}`)
await page.waitForTimeout(9000) // ensure AlertListener channel is SUBSCRIBED before broadcasting

await bc(uid, "sql_crossed",       { lead_id: "s1", lead_name: "Smoke Test Lead", grade: "A", company_name: "SmokeCorp" })
await bc(uid, "grade_dropped",     { lead_id: "s2", lead_name: "Cooling Lead", from_grade: "A", to_grade: "C", days_since_contact: 5, expected_value: 500000 })
await bc(uid, "follow_up_overdue", { overdue_count: 3, grade_a_count: 1 })
await page.waitForTimeout(3500)

const sql = await page.getByText(/SQL Alert/i).count()
const gd  = await page.getByText(/Grade Drop/i).count()
const fu  = await page.getByText(/overdue/i).count()
console.log(`sql_crossed: ${sql>0?"✅":"❌"}   grade_dropped: ${gd>0?"✅":"❌"}   follow_up_overdue: ${fu>0?"✅":"❌"}`)
await page.screenshot({ path: "qa-screenshots/uiux/smoke-realtime.png" })
await browser.close()
process.exit(sql>0 && gd>0 && fu>0 ? 0 : 1)
