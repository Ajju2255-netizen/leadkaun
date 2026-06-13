# Smoke tests

Live-infra smoke tests for the alert/email/job pipelines that unit tests can't cover.
Run against a local dev server on `:3000` with `DEV_AUTH_BYPASS=true` and the real Supabase + Resend env in `.env.local`.

## Email — `smoke-email.mjs`
Sends a real email via Resend from the verified domain to confirm delivery isn't rejected.
```
node scripts/smoke/smoke-email.mjs [recipient@example.com]   # default: workajsal@gmail.com
```
Pass = HTTP 200 + a message id. Confirms `RESEND_FROM_EMAIL` points at a verified domain (`send.leadkaun.com`).

## Realtime alerts — `smoke-realtime.mjs`
Opens the app (AlertListener subscribes), HTTP-broadcasts each alert type to `alerts:{userId}`, asserts the sonner toast renders.
```
node scripts/smoke/smoke-realtime.mjs
```
Pass = `sql_crossed ✅  grade_dropped ✅  follow_up_overdue ✅`.
Two prerequisites this test surfaced (now fixed): `<AlertListener />` must be mounted (dashboard layout) and the sonner `<Toaster />` must be mounted (root layout).

## Inngest jobs — manual (needs the Inngest dev server)
The cron/event functions (`intent-decay`, `follow-up-overdue`, `missed-opportunity`, `exec-score-alert`, `icp-regrade`, `morning-brief`) run in Inngest. To exercise them locally:
```
# 1. dev server running on :3000, then in another shell:
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
# 2. open the Inngest dev UI (http://localhost:8288) → Functions → Invoke each, or:
#    - icp-regrade: PUT /api/settings/icp (any change) emits `account/icp.updated`
#    - crons: invoke manually from the dev UI
# 3. verify side-effects in the DB (scores updated / notifications created / etc.)
```
Registration check (no Inngest server needed): `curl -s localhost:3000/api/inngest | grep -o '"function_count":[0-9]*'` → should be 7.
