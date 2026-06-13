// Email smoke test — sends a real email via Resend from the verified domain.
// Confirms the domain + RESEND_FROM_EMAIL are correctly wired end-to-end.
// Usage: node scripts/smoke/smoke-email.mjs [recipient]
import { readFileSync } from "fs"
for (const line of readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?/); if (m) process.env[m[1]] = m[2]
}
const KEY = process.env.RESEND_API_KEY
const FROM = process.env.RESEND_FROM_EMAIL || "noreply@send.leadkaun.com"
const TO = process.argv[2] || "workajsal@gmail.com"
const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    from: FROM, to: TO,
    subject: "Leadkaun smoke test ✅",
    html: "<p>If you're reading this, Leadkaun email delivery works — verified domain + from-address are wired correctly.</p>",
  }),
})
const j = await res.json()
console.log(`from: ${FROM}  to: ${TO}`)
console.log(`status: ${res.status}`, res.ok ? `· id: ${j.id}` : `· error: ${JSON.stringify(j)}`)
process.exit(res.ok ? 0 : 1)
