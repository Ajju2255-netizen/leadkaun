# Leadkaun — Platform Documentation

*Complete end-to-end reference for the Leadkaun product: architecture, data model, ICP, the scoring engine, every feature, ingestion, jobs, auth, billing, the admin panel, the marketing site, and operations.*

Generated from the codebase as of July 2026. Every claim here is grounded in source; file paths are given so you can jump to the code. Where the code and the marketing copy disagree, the code wins and the divergence is called out.

---

## What Leadkaun is

Leadkaun is a **"Sales Behaviour OS"** for Indian SMB sales teams — a lead-intelligence layer that grades every lead **A–F** across three dimensions (Fit × Intent × Quality), ranks a per-rep **Priority Queue** of who to call next, surfaces **₹ at risk** from stale leads, and drives reps with a morning brief, follow-up cadences, and 3-tap WhatsApp/call logging. It usually runs alongside an existing CRM rather than replacing it.

It is a hosted SaaS (Supabase Postgres + Vercel), multi-tenant, priced flat per account with a seat cap.

### Two repositories, two deploy targets

| Repo | Path | Runs at | Deployed to |
|---|---|---|---|
| **App** (the product) | `Leadkaun-Main/leadkaun` | `app.leadkaun.com` + `admin.leadkaun.com` | **Vercel** (Next.js) |
| **Marketing** | `Leadkaun-Main/leadkaun-marketing` | `leadkaun.com` | **Cloudflare Workers** via OpenNext |

The two are joined only by env-driven links (`APP_URLS` in the marketing repo → the app's `/login` and `/register`). This document is primarily about the **app**; the marketing site is covered in Part XIII.

---

## Table of contents

- **Part I** — Platform architecture & tech stack
- **Part II** — Multi-tenancy & the data model
- **Part III** — ICP configuration
- **Part IV** — The scoring engine (the heart)
- **Part V** — Core product features
- **Part VI** — Lead ingestion & sources
- **Part VII** — Background jobs (Inngest)
- **Part VIII** — Email system
- **Part IX** — Authentication & sessions
- **Part X** — Billing (Razorpay + seats)
- **Part XI** — Mission Control (platform admin)
- **Part XII** — Frontend architecture
- **Part XIII** — Marketing site & programmatic SEO
- **Part XIV** — Deployment & operations
- **Part XV** — Known gaps, caveats & divergences
- **Appendix** — Full route map, API surface, enums

---

# Part I — Platform architecture & tech stack

### Stack (app repo, `package.json`)

- **Next.js 14.2.35** (App Router), **React 18**, **TypeScript 5**
- **Prisma 7.6** with the **`@prisma/adapter-pg` driver adapter** over a native `pg` Pool (`lib/prisma.ts`; pool `max: 3` prod / `10` dev, singleton on `globalThis` in non-prod)
- **Supabase** — Postgres database, auth (email/password + magic-link), and realtime change feeds (`@supabase/supabase-js`, `@supabase/auth-helpers-nextjs`)
- **Inngest 4.1** — durable background jobs / cron
- **TanStack Query 5** — client data fetching
- **Tailwind CSS 3.4** + shadcn/`@base-ui/react` primitives, `lucide-react`, `sonner` (toasts), `next-themes`
- **zod 4** — env + API validation
- **Resend** + `@react-email/components` — transactional email (`emails/`)
- **papaparse** + **xlsx** — CSV/Excel import
- **vitest** (unit) + **Playwright** (E2E tooling)

### Route groups (`app/`)

- **`app/(dashboard)/`** — the customer product (~23 pages). Layout gates on `getServerSession()` → redirects to `/login`, wraps children in `OfflineProvider`, `ImpersonationBanner`, `AlertListener` (realtime toasts), and `DashboardShell` (sidebar).
- **`app/(auth)/`** — `login`, `register`, `forgot-password`, `set-password`.
- **`app/(admin)/`** — Mission Control (platform admin), physically under `/admin/*`, reachable only via the `admin.*` host. Self-gated per page.
- **`app/api/`** — ~80 route handlers.

### Host routing (`middleware.ts`)

- The `admin.leadkaun.com` host rewrites clean URLs onto the `(admin)` group's `/admin/*` paths and keeps the Supabase session alive; pages self-gate.
- On the customer host, `/admin` and `/admin/*` are **hard-404'd** — the admin surface is never reachable from `app.*`.
- Unauthenticated hits on protected paths redirect to `/login?redirectTo=…`; authenticated hits on auth pages redirect to `/queue`.
- The middleware matcher **excludes `/api/*`** — every API route self-guards.

---

# Part II — Multi-tenancy & the data model

*Source of truth: `prisma/schema.prisma` (~957 lines, PostgreSQL).*

## The tenant hierarchy: Account → Workspace → User

Leadkaun is a three-level tenant model with one deliberate twist: **the scoring "brain" (ICP + SQL thresholds) lives at the Account level, while operational data (leads, pipeline, sources, templates) lives at the Workspace level.**

- **Account** (`accounts`) — the top-level customer/company. Owns billing, the ICP/SQL scoring config, and one or more Workspaces. Identity: `name`, `industry`, `city`, `state`, `team_size`, `monthly_lead_vol`.
- **Workspace** (`workspaces`) — a **flat, never-nested** self-contained lead environment inside an account. Each owns its own leads, pipeline stages, sources, templates, follow-up configs, custom fields, membership, and analytics. `slug`, `is_default`, `archived_at` (soft-archive). Every new workspace is seeded with 8 default pipeline stages + 17 default lead sources by `provisionWorkspaceDefaults()` (`lib/workspace/provision.ts`).
- **WorkspaceMember** (`workspace_members`) — a User↔Workspace join. The user's **account role governs what they can do**; membership only controls *which* workspaces they see.
- **User** (`users`) — belongs to exactly one Account, linked to Supabase auth via `auth_id` (unique). `role`, `is_active`, invite tracking (`invited_by`, `invited_at`, `joined_at`).

### Roles (`UserRole`): ADMIN · MANAGER · REP

Data scoping (`lib/auth/session.ts → resolveWorkspaces`):
- **ADMIN** sees *every* non-archived workspace in the account (no membership row required).
- **MANAGER / REP** see only workspaces they are a `WorkspaceMember` of.
- The **active workspace** is pinned by the `lk_ws` cookie → falls back to the default workspace → first available → null.

Auth guards (`lib/auth/middleware.ts`): `requireAuth()` (401), `requireRole(...roles)` (403), `requireWorkspace(...roles)` (guarantees a non-null workspace so data routes can scope by `session.workspace.id`).

**Dev bypass:** `DEV_AUTH_BYPASS=true` (only when `NODE_ENV !== production`) synthesizes a session from the first active ADMIN — hard-guarded so a leaked prod env flag can't enable it.

## The data model, grouped

### A. Identity & tenancy
`Account`, `Workspace`, `WorkspaceMember`, `User`, and `RateLimit` (`rate_limits` — a DB-backed fixed-window API rate limiter serving `lib/rate-limit.ts`; fails **open**).

### B. Leads & scoring
- **Lead** (`leads`) — the central entity. Identity (`phone` normalized `+91…`, `email`, `company_name`, `designation`, `city`/`state`), source/import metadata, three 0–100 scores (`fit_score`, `intent_score`, `quality_score`) + `grade` (default E) + JSON breakdowns, SQL status (`is_sql`, `sql_crossed_at`, `handoff_brief`), speed-to-lead ML fields (`first_contact_at`, `speed_to_lead_hours`, `first_action_rank`), pipeline (`stage_id`, `stage_entered_at`), flags (`is_junk`/`junk_flags[]`, `is_fatigued`, `is_missed`/`missed_at`, `is_duplicate`), WhatsApp stage, and outcome (`won_at`/`lost_at`/`won_value`/`win_reason`/`loss_reason`/`outcome_snapshot`). **Dedup key: `@@unique([account_id, phone])`.**
- **LeadScoreEvent** (`lead_score_events`) — append-only "Score Evolution" timeline; one row per meaningful grade/confidence change, freezing a snapshot.
- **LeadSource** (`lead_sources`) — `intent_baseline` (seeds a lead's starting intent), `reliability_score`, `is_custom`.
- **LeadNote** (`lead_notes`) — immutable free-text notes.

### C. Pipeline
- **PipelineStage** (`pipeline_stages`) — `display_order`, `is_terminal`/`is_won`/`is_lost`.
- **StageHistory** (`stage_history`) — audit of stage moves.

### D. Activity & signals
- **Signal** (`signals`) — one engagement-evidence event: `signal_type` (large enum) + `signal_value` (points) + ML context (`intent_score_before`/`after`).
- **FollowUpAction** (`follow_up_actions`) — scheduled follow-up task with status/overdue/escalation.
- **FollowUpConfig** (`follow_up_configs`) — per-grade cadence (see Part V.6 — *stored but not wired to the live scheduler*).
- **WinAttribution** (`win_attributions`) — credits a user for a won lead (FULL/CONTRIBUTED).
- **SmartTemplate** (`smart_templates`) — WhatsApp / call-script template with stage/grade targeting.
- **CustomField** (`custom_fields`) — per-workspace custom lead field definitions.
- **Notification** (`notifications`) — in-app alerts (`user_id` null = all managers).

### E. Import / jobs
- **ImportJobStatus** (`import_job_status`) — CSV import session + progress counters.
- **JobRun** (`job_runs`) — background-job heartbeat log (powers Mission Control cron health).

### F. Billing
`Plan`, `Subscription`, `Payment`, `Invoice`, `WebhookEvent` — see Part X.

### G. Admin / platform
`PlatformAdmin`, `ImpersonationLog`, `AccountEvent` (append-only 16-type event stream powering timelines), `EmailLog`, `FeatureFlag`, `AdminInsight` — see Part XI.

### Key enums
`UserRole` (ADMIN/MANAGER/REP) · `LeadGrade` (A–F) · `SalesCycle` (SAME_DAY … OVER_THREE_MONTHS) · `SignalType` (the largest — WhatsApp/call/import/behavioural/rep-override/decay) · `NotifType` (AT_RISK, FOLLOW_UP_DUE, MISSED, RECOVERY, EXEC_SCORE_LOW, REP_SCORE_DROP) · `PlatformRole` (SUPER_ADMIN/SUPPORT) · `AccountEventType` (16 values). Full lists in the Appendix.

**Note on FK-free admin tables:** `ImpersonationLog`, `AccountEvent`, `EmailLog`, `JobRun`, `AdminInsight` use plain string references (no Prisma relations) so they never block account/user deletion.

---

# Part III — ICP configuration

ICP (Ideal Customer Profile) is set **once per account** and shared across all workspaces — the single scoring brain. Configured at **Settings → ICP** (`/settings/icp`, ADMIN only), titled "Best Customers."

Fields (on `Account`):
- **Industries** (15 options: Real Estate, Healthcare, Education, IT Services, Manufacturing, Retail, Financial Services, Construction, Hospitality, Automotive, Agriculture, Logistics, Textiles, Pharma, Media)
- **States** (15 Indian states)
- **Business types** (8: B2B, B2C, D2C, Franchise, Distributor, SaaS, Agency, Manufacturer)
- **Roles** (8: Owner/Founder, CEO/MD, Sales Head, Marketing Manager, Purchase Manager, HR Manager, Operations Head, IT Manager)
- **Budget min / max** (₹)
- **Sales cycle** (SAME_DAY … OVER_THREE_MONTHS — drives intent decay speed)
- **SQL Fit threshold** and **SQL Intent threshold** (0–100 sliders; DB defaults 55/45)

**AI suggestions** (`GET /api/settings/icp/suggestions`): analyses the 500 most recent non-junk leads and suggests top industries/states/roles by volume, flagging segments that have produced wins (with ₹ won). Shown once ≥5 leads are analysed; "Apply all" merges suggestions into the selection.

Saving (`PUT /api/settings/icp`, ADMIN) records an `ICP_CONFIGURED` event and fires the `account/icp.updated` Inngest event to re-grade every lead. **Note:** the client *also* fires `POST /api/admin/regrade` on save, so two regrade paths run per save (see Part IV.7 — they compute intent differently).

**Deferred:** the `weight_overrides` column exists on `Account` but is **not wired into the engine and has no UI** — signal weights are not customer-tunable today (all accounts use the single global weight map).

---

# Part IV — The scoring engine (the heart)

*Source: `lib/scoring/*`. Every lead is graded **A–F** from three independent 0–100 dimensions — **Fit**, **Intent**, **Quality**. The grade is a threshold matrix over the three, not a single blend.*

The canonical pipeline is `processSignalAndUpdateScores()` (`lib/scoring/orchestrator.ts`), run inside a Prisma transaction on: lead create, CSV import, every call/WhatsApp signal, and the ICP-regrade job.

## IV.1 Fit (0–100) — `fit-score.ts`

Five components, "match → full points; mismatch → 0 (no penalty); unknown → small credit":

| Component | Max | Match rule |
|---|---|---|
| industry | 30 | inferred industry == an ICP industry |
| geography | 20 | `state` == an ICP state |
| business_type | 20 | `company_name` contains an ICP business type |
| role | 15 | `designation` contains an ICP role |
| budget | 15 | `expected_value` in ICP range (full) / within 30% (8) |

If ICP is **not configured**, fit short-circuits to a fixed baseline totalling **38** (keeps leads around D until ICP is set).

## IV.2 Quality (0–100) — `quality-score.ts`

Data-completeness + source reliability:

| Component | Points |
|---|---|
| phone | valid Indian mobile 30 / landline 15 / else 0 |
| email | present 15 |
| company | present 15 |
| inquiry | 0–20 by word count + price/product keywords |
| source | `min(reliability,100)/10` → 0–10 |
| junk | −10 if flagged |

Floored at 0.

## IV.3 Intent (0–100) + decay — `intent-score.ts`

`intent = Σ(signal_value) − decayPenalty`, then **clamped to `[source_baseline, 100]`** (intent never drops below where the lead started).

**Decay:** after the lead sits `DECAY_THRESHOLD_DAYS[sales_cycle]` past its last positive signal, it loses **3 intent points/day** (`DECAY_RATE_PER_DAY = 3`). Thresholds by sales cycle: SAME_DAY 1, THREE_DAYS 3, TWO_WEEKS 14, **FOUR_WEEKS 28 (default)**, THREE_MONTHS 90, OVER_THREE_MONTHS 120.

## IV.4 Signals — `signal-weights.ts`

A signal is a row recording one piece of engagement evidence; its point value comes from the global `SIGNAL_WEIGHTS` map. Selected values:

- **WhatsApp reply:** WA_REPLIED_1H **+15**, 4H +10, 24H +5, WA_NO_REPLY −5
- **WhatsApp tags:** ASKED_PRICING **+20**, NEGOTIATING **+25**, COMPARING +15, DECISION_PENDING +10, BROCHURE +10, NOT_SERIOUS −15, WRONG_NUMBER −30
- **Call outcomes:** ANSWERED_INTERESTED **+20**, CALLBACK +10, NOT_INTERESTED −20, WRONG_NUMBER −30, INVALID −30, NOT_ANSWERED −3
- **Import inference:** IMPORT_HIGH_INTENT **+40**, MEDIUM +20, RECENT_CONTACT +30, ACTIVE_INTEREST +30, WARM +15, STALE −20, NEGATIVE −25
- **Rep overrides:** REP_VERY_INTERESTED **+25**, REP_NOT_INTERESTED −25
- **Behavioural:** STAGE_PROPOSAL_SENT +15, EMAIL_CLICKED +10, EMAIL_OPENED +5, INQUIRY_EVENING_WEEKEND +8
- **System:** INTENT_DECAY (per-day delta)

Signals feed **intent** only; quality is purely data-completeness. The `SOURCE_BASELINE` signal is written at lead creation and carries the source's `intent_baseline` as the intent floor.

## IV.5 Grade — `grade.ts`

**F guard first:** `quality < 20 → F`, always.

Two threshold ladders. **Pre-execution** (no call/WA activity yet — fit + quality dominate) e.g. `A → fit≥70 & quality≥65 & intent≥15`. **Post-execution** (rep has logged activity — all three weighted) e.g. `A → fit≥65 & intent≥60 & quality≥60`. Import-time signals (`SOURCE_BASELINE`, `IMPORT_*`) do **not** count as execution; a real call/WA/rep signal does.

Grade → action (`next-action.ts`): A "Call now" (P1), B "Call today" (P2), C "Nurture" (P3), D "Low priority" (P4), E "Drop" (P5), F "Junk" (P6).

## IV.6 SQL determination — `grade.ts`

A lead is **SQL** when `fit ≥ sql_fit_threshold AND intent ≥ sql_intent_threshold` (both, independently; defaults 55 / 45; quality is not part of it). Crossing SQL stamps `sql_crossed_at` and fires an SQL-alert email to the assigned rep.

## IV.7 The blended "AI score" (ranking only)

The Priority Queue ranks by a single blended score (`ai-score.ts`): **intent 0.50 + fit 0.30 + quality 0.20**. This is intent-weighted ("who's hot right now") and is deliberately distinct from the leads-table 40/30/30 fit-heavy blend. It does **not** set the grade.

Two supporting scores, computed on demand (not stored): **Confidence** (`confidence.ts`, 0–100 field-completeness; `needsEnrichment < 50`) and **Freshness** (`freshness.ts`, age bands from Fresh to Cold).

## IV.8 When re-grading happens

1. **Real-time** — the orchestrator, synchronously on lead create / import / every signal.
2. **Nightly intent decay** — Inngest cron `30 20 * * *` (**02:00 IST**), batches of 200 across all accounts; on a genuine grade drop, emails the assigned rep.
3. **ICP change** — the `account/icp.updated` Inngest job (batches of 50, 1 concurrent per account) runs the canonical orchestrator.
4. **Enrichment edits** — `recompute.ts` re-runs fit + quality only (intent unchanged) and applies the notes-keyword grade override.

> **Divergence to be aware of:** the ICP settings page fires *both* the Inngest regrade (canonical orchestrator) and `POST /api/admin/regrade` on every save. The `/api/admin/regrade` path uses a *different* intent formula (adds source baseline + notes-intent, applies a ×2 spread multiplier, and a hard notes-keyword grade override) and can produce different grades than the real-time orchestrator. See Part XV.

---

# Part V — Core product features

*All customer pages live in `app/(dashboard)/`; all customer APIs under `app/api/` (excluding `admin/*` and `billing/*`). Login lands on `/queue`.*

## V.1 Priority Queue (`/queue`) — the home screen

The ranked call list. `GET /api/queue` returns up to 200 active leads (excluding junk/fatigued/missed/won/lost), enriches each with `ai_score`, `next_action` + reason, channel hint, activity hint, and an `is_hot_signal` flag (latest hot signal within a 2h window), and **sorts by `ai_score` descending** — this is the re-rank. The page shows header KPIs (leads to call, high-priority count, ₹ in play), client-side filters, and a Top-5 split (hero card + 4 ranked rows + the rest, with grade tabs). It polls every 30s and subscribes to Supabase realtime change feeds on `leads`/`signals` (Live/Polling pill).

## V.2 Missed Opportunity Engine — "₹ at risk" (`/missed`)

An **hourly** Inngest job marks leads `is_missed` once they exceed a per-grade staleness window: **A 24h, B 48h, C 7d, D 30d** (on `last_action_at`, or `imported_at` if never actioned). It creates AT_RISK (at 5/6 of threshold), MISSED, and rep-targeted RECOVERY (A/B only) notifications. `GET /api/analytics/missed` (ADMIN/MANAGER) returns all missed leads valued by **`expected_value`** (Σ = "₹ at risk today"), a 7-day trend, "recovered this week" (Σ `won_value` of A–D won in 7d), and a per-rep breakdown. Logging any activity on a missed lead clears `is_missed` (the recovery path).

## V.3 Morning Brief (email, 8:30 AM IST)

Inngest cron `0 3 * * 1-6` (**08:30 IST, Mon–Sat**) sends a **role-specific** email:
- **REP:** top A/B open leads, callbacks + follow-ups due today, re-engagements, week's completions, a recent win → links to `/queue`.
- **ADMIN/MANAGER:** pipeline ₹ value, active leads, team follow-up %, uncalled Grade-A leads >48h old, per-rep stats, top-rep spotlight → links to `/analytics`.

There is no dedicated in-app brief page; the same data lives in `/dashboard` and `/analytics`.

## V.4 Pipeline (`/pipeline`)

A Kanban board. Columns = non-terminal stages + Won (Lost is a bottom banner). HTML5 drag/drop optimistically moves cards and `POST`s to `/api/leads/[id]/stage`; **backward moves require a note** (auto-added on drag). Cards show "stuck" bands by days-in-stage. `GET /api/pipeline/stages` auto-seeds 8 defaults (New Inquiry → Contacted → Qualified → Proposal Sent → Negotiation → Follow-up → Won/Lost). `GET /api/pipeline/summary` returns all-time KPIs with month-over-month deltas + sparklines, a 30-day value trend, top sources, and recent activity.

**Auto-stage** (`lib/pipeline/auto-stage.ts`): signals advance the stage automatically (WA reply/call-answered → *contacted*; ASKED_PRICING → *qualified*; NEGOTIATING → *negotiation*). Advance-only, never backward/terminal; writes `StageHistory` and schedules a follow-up.

## V.5 Lead management (`/leads`, `/leads/[id]`)

- **List** — filterable (search, grade, stage, source, rep, date, import batch), 100/page, with a weighted total score column (`fit*0.40 + intent*0.30 + quality*0.30`), inline stage + rep editing, bulk export/assign.
- **Detail** — full record with score bars, Confidence/Freshness, **Score Evolution timeline** (`LeadScoreEvent`), activity (signals + notes merged), and a WhatsApp tab.
- **Actions:** notes (`POST …/notes`), mark won (`…/won` — records WinAttribution), lost (`…/lost`), junk (`…/junk`, requires flags), reassign (`…/assign`), schedule follow-up (`…/follow-up`), timeline (`…/timeline`). *(`…/source` and `…/snooze` exist but have no UI caller.)*

## V.6 Follow-ups (`/follow-ups`)

Generated by `scheduleFollowUp()` (called from auto-stage and signal logging) on a **hardcoded per-stage cadence** (contacted +4h CALL, qualified +24h WA, proposal_sent +48h WA, negotiation +24h CALL). A **30-minute** Inngest job promotes overdue actions and notifies. `GET /api/follow-ups/engine` computes the follow-up score = completed / (completed + overdue). Actions: complete, skip (+24h).

> `FollowUpConfig` (per-grade cadence, `PUT /api/settings/follow-up-config`) is **stored but not wired** — the live scheduler ignores it and uses the hardcoded stage map. There's no settings UI for it.

## V.7 Smart Templates + WhatsApp/call logging (`/settings/templates`)

Templates (`SmartTemplate`, max 20) are WhatsApp or call-script bodies with `{{first_name}} {{company}} {{grade}} {{stage}} {{rep_name}}` variables and optional stage/grade targeting, with a live preview.

**3-tap WhatsApp logging:** pick a template → open WhatsApp (`wa.me`) → log the outcome tag. `POST /api/signals/whatsapp` writes the signal, derives stage-advance/regress, updates the WA conversation stage, records speed-to-lead on first contact, **clears `is_missed`**, runs auto-stage + follow-up scheduling, re-scores, and (post-commit) fires realtime alerts + an SQL-alert email on SQL crossing. `POST /api/signals/call` mirrors this for call outcomes.

> **WhatsApp is manual signal logging, not a BSP/API integration.** There is no Gupshup/Twilio/WATI client and no outbound messaging — the UI opens the user's own WhatsApp and records the outcome.

## V.8 Analytics (`/analytics`, `/dashboard`, `/rep-tracking`, `/learning`)

- `/analytics` (ADMIN/MANAGER) — loss intelligence, pattern detection, source performance (`/api/analytics/intelligence`).
- `/dashboard` — pipeline funnel, top reps, active sources, recent activity, behaviour health.
- `/rep-tracking` — per-rep scorecards (`rep-score.ts`: follow-up% 25, speed 20, missed-recovery 15, execution 20, conversion 20).
- `/learning` — the **Learning Engine** (`lib/analytics/learning.ts`): account-level learned patterns, each **gated by sample size** with an honest "still learning" state below threshold.
- **Execution score** (`execution-score.ts`): daily per-rep score (follow-ups 35, leads touched 20, speed 20, signals 15, overdue penalty 10). A 3pm cron alerts managers about reps scoring below 25.

## V.9 Activity feed & compliance (`/activity`)

- **Feed** (`/api/activity/feed`) — the signal log (who did what to which lead when), filterable; REPs see only their own.
- **Compliance** (`/api/activity/compliance`) — per rep, this IST month: **response compliance %** (leads contacted within grade SLA — A≤24h/B≤48h/C≤7d/D≤30d) and **follow-up adherence %**, banded compliant / at-risk / breached.

## V.10 Onboarding (`/onboarding`)

A chrome-less 6-step wizard: Welcome → Define ICP (with AI suggestions) → Add Leads (embedded import) → Invite Team → SQL Thresholds → Review & Launch. Finishing posts to `/api/settings/onboarding-complete`.

## V.11 Notifications (`/notifications`)

In-app feed (last 7 days, user-addressed + account-wide, unread-first). Types come from the background jobs: AT_RISK, MISSED, RECOVERY, FOLLOW_UP_DUE, plus grade-drop/SQL alerts. **Realtime toasts** are pushed via Supabase broadcast to the `AlertListener`; **email alerts** fire for SQL crossings and grade drops.

---

# Part VI — Lead ingestion & sources

## CSV import (primary path)

Three short endpoints keep each request under the serverless ceiling; the browser parses the file and streams rows:
- **`/api/import/csv/init`** (ADMIN/MANAGER, 20 imports/hr/account) — validates source/stage, enforces `MAX_IMPORT_ROWS = 100,000`, creates an `ImportJobStatus`.
- **`/api/import/csv/batch`** (≤200 rows/batch) — runs `processImportRows()` and atomically increments job counters.
- **`/api/import/csv/complete`** — flips the job COMPLETE/FAILED, stores up to 100 error strings, records an account event.

Per row: validate (name + phone required) → dedupe by `(workspace_id, phone)` → infer import signals → in one transaction create the Lead + a `SOURCE_BASELINE` signal + inferred signals, then score via the orchestrator. Column mapping (`lib/import/column-map.ts`) has 100+ aliases + fuzzy fallback. Amounts parse Indian formats (`₹1,50,000`, `2.5L`, `1Cr`). A one-shot variant (`/api/import/csv`, max 10 MB, PapaParse) backs onboarding.

## Google Sheets sync — scaffolded, dormant

Real client code exists (`lib/import/sheets-poller.ts`: OAuth token refresh + Sheets v4 fetch), and `/api/import/sheets` encrypts the refresh token via `lib/crypto.ts` (AES-256-GCM). **But the `GoogleSheetsConfig` Prisma model was never migrated**, there is no OAuth callback route, and the `sheets-sync` cron is a no-op. This is a Phase-7 feature that isn't functional. The `/leads/import` UI shows Sheets + Manual as "coming soon."

## Lead sources

`LeadSource` = `{ name, key, intent_baseline (0–100), reliability_score, is_custom }`. `GET /api/lead-sources` auto-seeds 13 defaults (e.g. Referral 75, Website Form 65, IndiaMART 60, Cold Call 20). A source's `intent_baseline` seeds a lead's intent and feeds decay; every lead carries a `source_id`.

## Encryption (`lib/crypto.ts`)

AES-256-GCM, envelope `v1:<iv>:<tag>:<ciphertext>`, key from `ENCRYPTION_KEY` (throws in production if missing). Currently used only for the Google Sheets refresh token (and the impersonation marker). Since the Sheets model isn't migrated, no encrypted secrets are persisted in prod yet.

---

# Part VII — Background jobs (Inngest)

Client id `leadkaun`, served at `/api/inngest`. Every function writes a `JobRun` heartbeat (powers Mission Control cron health). Crons are UTC; IST = UTC+5:30.

| Function | Schedule (UTC) | IST | What it does |
|---|---|---|---|
| **Intent decay** | `30 20 * * *` | 02:00 daily | Recompute intent (with decay) for all active leads, batches of 200; email reps on grade drops |
| **ICP regrade** | event `account/icp.updated` | on demand | Re-score all account leads via the orchestrator (1 concurrent/account) |
| **Follow-up overdue** | `*/30 * * * *` | every 30 min | Mark overdue follow-ups, notify + realtime toast |
| **Morning brief** | `0 3 * * 1-6` | 08:30 Mon–Sat | Role-specific brief emails |
| **Missed opportunity** | `0 * * * *` | hourly | Mark stale leads missed; AT_RISK/MISSED/RECOVERY notifications |
| **Exec-score alert** | `30 9 * * 1-6` | 15:00 Mon–Sat | Alert managers about reps scoring < 25 |
| **Sheets sync** | `*/5 * * * *` | every 5 min | **No-op** (Sheets model unmigrated) |
| **Admin daily insights** | `0 2 * * *` | 07:30 daily | Mission Control cross-account digest → `AdminInsight` |

**Dangling events** (fired, no consumer): `import/sheets.rows`, `alerts/missed-opportunity`, `alerts/rep-missed-opportunity`. The missed-opportunity DB notifications still work; only the follow-through email alerts are unwired.

---

# Part VIII — Email system

**Provider: Resend** (`lib/email/send.ts`). The client is built lazily so a missing `RESEND_API_KEY` no-ops instead of failing the build. Every send writes an **`EmailLog`** row (`template`, `subject`, `provider_id`, `status`, `opened_at`).

Templates (`emails/`, React Email on `BaseEmail`):
- **WelcomeAdmin** — new-org signup.
- **SqlAlert** — a lead crossed SQL (from the call/WA signal routes).
- **GradeDrop** — nightly decay dropped a grade.
- **MorningBriefRep** / **MorningBriefManager** — the morning-brief cron.

**Resend webhook** (`/api/webhooks/resend`, shared-secret query param): `email.opened` → sets `EmailLog.opened_at`; `email.bounced`/`complained` → flips `status: failed`. Powers deliverability + brief-open metrics in Mission Control.

> Per an in-code note, the transactional emails are wired but **won't deliver until the Resend sending domain is verified**.

---

# Part IX — Authentication & sessions

Auth is **Supabase** (email/password + magic-link) with a Prisma mirror. Two identities per user: `authId` (Supabase) and `id` (Prisma). `getServerSession()` reads the Supabase cookie, looks up the Prisma `User` by `auth_id`, joins the `Account`, and **rejects `is_active = false`** users.

- **Register** (server action) — creates the Supabase user, then in one transaction: `Account` (+ signup attribution), the first `User` as **ADMIN** (first user is always admin), a default "Main" workspace, membership, and default stages/sources. Rolls back the Supabase user on DB failure. Records `SIGNUP`, sends the welcome email, redirects to `/onboarding`.
- **Login** — `signInWithPassword`, redirect to `redirectTo` (default `/dashboard`).
- **Team invite** (ADMIN) — **seat check runs before the email** (409 `SEAT_LIMIT_REACHED`), then `inviteUserByEmail` (48h magic link), then a placeholder `User` (`is_active: false`) + workspace membership. Records `USER_INVITED`.
- **Invite acceptance** — `/api/auth/confirm` (PKCE-safe) or `/api/auth/callback` (OAuth code) flips the placeholder to `is_active: true, joined_at: now` and records `USER_JOINED`. Invite type → `/set-password`.
- **Forgot/reset** — `resetPasswordForEmail` → `/settings/security`; always shows "check your inbox" (anti-enumeration).

**Workspaces:** the `lk_ws` cookie pins the active workspace; `/api/workspaces/switch` validates access and rewrites it (httpOnly, 1-year, SameSite=Lax).

---

# Part X — Billing (Razorpay Subscriptions + seats)

*Built end-to-end. Pricing is **flat per account** (not per seat), priced by team size AND monthly lead volume, with premium features gated by tier. Provider webhooks are the source of truth; a manual founder path (Mission Control PlanEditor) writes the same rows.*

## Plans (DB `plans`, prices in **paise**)

| Plan | Price | Seats | Leads/mo | Gate |
|---|---|---|---|---|
| Free (`trial`) | ₹0 (14 days) | 1 | 100 | core only |
| **Starter** | ₹2,999/mo | 10 | 5,000 | + basic analytics |
| **Growth** | ₹7,999/mo | 30 | 25,000 | + AI Learning, Missed Opp, Rep tracking, advanced analytics |
| **Scale** | ₹19,999/mo | 75 | unlimited | + multiple workspaces, API, webhooks |
| Enterprise | custom | ∞ | unlimited | everything |

Seat + monthly-lead limits are enforced (`lib/billing/seats.ts`, `lib/billing/lead-usage.ts`); premium features are gated by tier (`lib/billing/entitlements.ts`). Lead cap is a hard, calendar-month cap enforced on manual create + CSV import.

`scripts/razorpay-sync-plans.ts` creates the Razorpay Plan entities and stores `provider_plan_id` (dry-run by default; `--commit` to write; idempotent). Until it runs, a plan is not sellable and the button is disabled.

## Checkout flow

- **`GET /api/billing/subscription`** — current plan, status, seat usage, sellable plans (with `sellable` and `tooSmall` flags).
- **`POST`** (ADMIN) — validates the plan, rejects unsynced/already-active/too-small-for-team, reuses or creates the Razorpay customer, creates the subscription, upserts a local `trialing` Subscription with the provider id. **Does not mark active** — activation is webhook-only.
- **`POST /api/billing/verify`** (ADMIN) — the browser's success handler; verifies the HMAC (signed over `payment_id|subscription_id` — the reverse of the Orders flow), confirms the subscription belongs to the caller's account, then **re-fetches status from Razorpay** rather than trusting the client.
- **`DELETE`** — cancels at cycle end; status flips when the webhook confirms.

## Webhook (`/api/billing/webhook`) — the source of truth

Unauthenticated by design (HMAC over the raw body using `RAZORPAY_WEBHOOK_SECRET` is the auth). Handles 6 subscription events (activated/charged/pending/halted/cancelled/completed). **Idempotency:** a `WebhookEvent` row (unique on `[provider, event_id]`) is claimed inside the same transaction as the writes; a duplicate delivery hits a unique-violation and returns 200 before any double-write. `Payment`/`Invoice` are unique on `[provider, provider_ref]` too. Genuine transient failures return 500 so Razorpay redelivers (at-least-once, ~24h). Only a settled charge sets `mrr_inr`; halted/pending leave MRR untouched.

> `payment.failed` is deliberately **not** handled — it carries no subscription entity and can't be attributed to an account; failed renewals surface as `subscription.pending`/`.halted`.

## Seats (`lib/billing/seats.ts`)

A seat is occupied by any **non-deactivated** user: `is_active = true` **OR** a pending invite (`is_active = false, joined_at IS NULL`). `joined_at` disambiguates "invited-not-accepted" from "deactivated" (stamped on acceptance, never cleared). Counting pending invites prevents queueing 50 invites past a 10-seat cap; removal is a hard delete, freeing the seat immediately. Accounts with no subscription default to the **trial** limit (fails closed); a **cancelled** subscription reverts to trial (Scale's 50 seats don't linger). Enforced on invite (`SEAT_LIMIT_REACHED`, before the email) and on purchase (`SEATS_EXCEED_PLAN`). **Settings → Billing** shows a seat-usage meter and disables plans the team is too big for.

---

# Part XI — Mission Control (platform admin)

A fully separate cross-tenant admin surface at **admin.leadkaun.com** (`app/(admin)/`), never resolving Account/Workspace scope.

## Platform auth (`lib/auth/platform.ts`)

`getPlatformSession()` requires **all three**: email in the `PLATFORM_ADMIN_EMAILS` allowlist, an active `platform_admins` row, and MFA elevation (Supabase AAL2). `PlatformRole` = **SUPER_ADMIN** (writes + impersonation) / **SUPPORT** (read-only).

> **MFA is currently gated off** (`PLATFORM_MFA_REQUIRED` not "true") — the code itself flags that it should be on, since a platform admin can impersonate any tenant.

## Modules

- **Dashboard** — cross-account KPIs (companies, paying, trials, MRR, signups/active/imports/emails today), 5 system-health pills, live activity timeline, and the AI-insights banner.
- **Customers** — a CRM list of every account with a health dot, counts, plan + MRR, last-active.
- **Company 360°** — health score (0–100, transparent weighted: imports/active-users/adoption/activity/brief-opens over 14 days) + churn band, usage stats, team roster, workspaces, health reasons, feature-flag toggles, full timeline, the manual **PlanEditor** (SUPER_ADMIN plan/MRR upsert), and a **Login-as-Customer** button.
- **Revenue** — MRR, ARR, paying, trials, conversion %, churn %, plan distribution (CAC/LTV/payments are provider-gated placeholders).
- **Product Analytics** — the acquisition funnel (signup → verified → imported → scored → brief → returned → paid, with drop-off) and honest feature-adoption proxies.
- **System** — DB ping, email counts, rate-limit keys, **cron heartbeats** (stale = no run in 48h), per-template email engagement, recent errors.
- **Support** — debounced cross-account global search over companies/users/leads/workspaces → Company 360.
- **Daily AI insights** — computed action items (new customers, churn-risk = paying-but-inactive-14d, inactive trials, not-yet-onboarded), snapshotted daily into `AdminInsight`.

## Impersonation ("Login as customer")

SUPER_ADMIN only. Writes the `ImpersonationLog` audit row **first**, mints a one-time Supabase magic link, signs an encrypted 1h impersonation marker, and returns an app-host URL. The landing sets an httpOnly `lk_impersonation` cookie; the `ImpersonationBanner` shows a persistent "all actions are audited" bar with an Exit that stamps `ended_at`.

## Feature flags (`lib/feature-flags.ts`)

Per-account toggles (`learning_engine, queue, pipeline, analytics, confidence`); missing row = ON; reads fail open. Admin writes them from Company 360.

> **Half-wired:** `isFeatureEnabled` is defined but **has no product consumers yet** — toggling a flag is recorded and displayed but doesn't gate any customer-facing feature today.

---

# Part XII — Frontend architecture

- **`components/ui/`** — shadcn/base-ui primitives.
- **`components/shared/`** — domain UI: `ThemedSelect` (app-wide dropdown on base-ui so the list renders in a themed portal), `ModalPortal` (portals overlays to `<body>`), `GradeBadge`, `ScoreBar`, `ScoreTimeline`, `ConfidenceCard`, `RupeeValue`, `LeadSlideOver`, `ImpersonationBanner`, `FreshnessBadge`.
- **`components/providers/`** — `QueryProvider` (TanStack), `OfflineProvider`, `AlertListener` (realtime toasts).
- **`hooks/`** — `useCurrentUser`, `useDashboard`, `useQueue`, `useQueueRealtime`, `useImportStatus`, `useRazorpayCheckout`.
- **`lib/`** — domain-organized: `scoring/*`, `billing/*`, `import/*`, `follow-ups/*`, `pipeline/*`, `realtime/*`, `admin/*`, `analytics/*`, `auth/*`, `supabase/*`, `email/*`, `crypto.ts`, `rate-limit.ts`, `feature-flags.ts`.

**API response envelope:** `apiSuccess(payload)` returns the payload *directly* (not wrapped in `{ data }`); `apiError(msg, code, status)`. Some clients defensively accept both shapes.

---

# Part XIII — Marketing site & programmatic SEO

*Repo `leadkaun-marketing` — Next.js 16 / React 19, deployed to **Cloudflare Workers via OpenNext** (ISR, not static export). `leadkaun.com`.*

- **Cloudflare setup:** incremental cache → R2 (`leadkaun-isr-cache`), tag cache → KV; pSEO data in R2 (`leadkaun-pseo`); Workers Paid plan for the ~30s CPU ceiling. Deploy with `npm run cf:deploy`.
- **Programmatic SEO (~74k URLs):** data in `data/pseo/*.json` — **625 cities**, 12 industries, 8 keywords, 10 roles, 5 competitors, plus glossary/questions/how-to/resources/integrations. Dynamic routes: `[industry]/[city]` (7,500), `[industry]/[city]/[keyword]` (60,000), `city/[city]` (625), `for/[role]/[city]` (6,250), plus compare/glossary/questions/blog. Tier-1+2 cities are pre-rendered into R2; the long tail is on-demand ISR (24h cache). Sitemap = an index + 10 shards.
- **Pricing page:** five tiers — Free ₹0 → Starter ₹2,999 → **Growth ₹7,999** → Scale ₹19,999 → Enterprise (custom), with a Monthly/Annual toggle (save 17%), a feature-comparison table, and add-ons. Structured data (`offerSchema`) emits `price` + `per month`.
- **Links to the app** via `APP_URLS` (`lib/urls.ts`) → `app.leadkaun.com/login` and `/register`.

---

# Part XIV — Deployment & operations

## Environment variables (app)

Validated at import by `lib/env.ts` (zod; throws on missing/invalid).

**Required:** `DATABASE_URL` (pooled `:6543`), `DIRECT_URL` (direct `:5432`, for migrations), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_APP_URL`, `NEXTAUTH_SECRET` (≥32 chars).

**Optional:** `GOOGLE_CLIENT_ID`/`_SECRET`, `RAZORPAY_KEY_ID` (starts `rzp_`), `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (a *different* value from the key secret).

**Used but not in the schema:** `ENCRYPTION_KEY` (throws in prod if unset), `DEV_AUTH_BYPASS`, `PLATFORM_ADMIN_EMAILS`, `PLATFORM_MFA_REQUIRED`, `NEXT_PUBLIC_ADMIN_URL`.

## Commands

```bash
npm run dev      # next dev (port 3000)
npm run build    # prisma generate && next build
npm run lint     # next lint  ← MUST pass; Vercel prod build fails on ESLint errors
npm run test     # vitest
```

**Lint gate:** unlike the marketing repo, the app's `next.config.mjs` does NOT ignore lint/TS errors, so ESLint errors fail the Vercel production build. Run `npm run lint` (and `build`) before merging — `tsc` alone misses lint failures. Don't run `build` while `dev` is up.

## Migrations

- Local dev runs against an isolated local Postgres `leadkaun_dev` over a `/tmp` Unix socket.
- `prisma migrate deploy` can't reach the socket DB, so local staging uses **`bash scripts/migrate-staging.sh`** (applies migration SQL over the socket, records `_prisma_migrations` itself).
- **Production:** `prisma migrate deploy` against `.env.local.prod`'s `DIRECT_URL`, after testing on staging.

## Testing

vitest unit tests in `lib/__tests__/`: `crypto.test.ts`, `razorpay.test.ts`, `seats.test.ts`. Playwright + QA screenshot tooling exist but aren't wired into an npm test script.

---

# Part XV — Known gaps, caveats & divergences

*Consolidated from a full-codebase read. None of these block the core product, but they matter operationally.*

1. **Google Sheets sync is non-functional** — the `GoogleSheetsConfig` model was never migrated; the poller and `sheets-sync` cron are dead. UI shows "coming soon."
2. **Feature flags don't gate anything** — writes/UI exist, but `isFeatureEnabled` has no product consumers yet.
3. **Platform MFA is off** (`PLATFORM_MFA_REQUIRED` ≠ "true") despite impersonation power — should be re-enabled.
4. **`weight_overrides` is dead** — the column exists but signal weights aren't customer-tunable.
5. **Two divergent regrade paths** run on every ICP save — the canonical orchestrator and `/api/admin/regrade` (which adds source baseline + notes-intent, a ×2 multiplier, and hard notes grade overrides). They can disagree on a lead's grade.
6. **`FollowUpConfig` is stored but not wired** — the live scheduler uses a hardcoded per-stage cadence.
7. **Dangling Inngest events** — `import/sheets.rows`, `alerts/missed-opportunity`, `alerts/rep-missed-opportunity` are fired but have no consumer (missed-opportunity DB notifications still work).
8. **Lead-detail contract bugs** — the detail page's Won/Lost modals send enum values the API rejects (only "OTHER" validates), and its Junk button omits the required `flags` body (422). The *pipeline* page's own Won/Lost modals are correct.
9. **Follow-up snooze reason discarded** — the modal collects a reason but `/skip` accepts no body.
10. **Unused-but-implemented routes** — `/api/leads/[id]/source` and `/api/leads/[id]/snooze` have no UI caller; `lib/scoring/nba.ts` (a richer next-best-action engine) is test-only.
11. **`lib/scoring/grade.ts` doc comment disagrees with the code** on the C-tier pre-execution rule — trust the code.
12. **ICP page state defaults (60/50) differ from DB defaults (55/45)** for SQL thresholds — the DB value wins once loaded.
13. **Response-shape mismatch** in admin search — `search/route.ts` wraps in `apiSuccess(...)` while the Support page reads `res.accounts` at the top level.
14. **Emails won't deliver until the Resend sending domain is verified.**

---

# Appendix

## Full customer route map (`app/(dashboard)/`)

`/queue` · `/follow-ups` · `/pipeline` · `/leads` · `/leads/[id]` · `/leads/import` · `/dashboard` · `/activity` · `/analytics` (A/M) · `/rep-tracking` (A/M) · `/learning` (A/M) · `/missed` (A/M) · `/notifications` · `/onboarding` · `/settings/{profile,security,org,billing,team,workspaces,icp,sources,templates}`

## Customer API surface (selected)

**Queue/Pipeline/Leads:** `GET /api/queue` · `GET /api/pipeline/stages` · `GET /api/pipeline/summary` · `GET,POST /api/leads` · `GET /api/leads/stats` · `GET,PATCH,DELETE /api/leads/[id]` · `POST /api/leads/[id]/{stage,notes,won,lost,junk,assign,source,snooze,follow-up}` · `GET /api/leads/[id]/timeline` · `GET,POST /api/lead-sources`

**Follow-ups/Signals/Templates:** `GET /api/follow-ups` · `GET /api/follow-ups/engine` · `POST /api/follow-ups/[id]/{complete,skip}` · `POST /api/signals/{whatsapp,call}` · `GET,POST /api/templates` · `PATCH,DELETE /api/templates/[id]`

**Analytics/Activity/Notifications:** `GET /api/analytics/{dashboard,dashboard-pulse,execution-score,follow-up-score,intelligence,learning,rep-tracking,missed,missed/count}` · `GET /api/activity/{feed,compliance}` · `GET /api/notifications` · `GET /api/notifications/count` · `POST /api/notifications/{read-all,[id]/read,[id]/dismiss}`

**Settings/Team/Workspaces/Import:** `GET,PUT /api/settings/icp` · `GET /api/settings/icp/suggestions` · `GET,PUT /api/settings/follow-up-config` · `POST /api/settings/onboarding-complete` · `/api/team/{members,invite,members/[id]}` · `/api/workspaces/{,[id],[id]/members,switch}` · `/api/import/csv/{init,batch,complete}` · `/api/import/{csv,sheets,history,status/[id]}` · `GET,PATCH /api/profile`, `/api/profile/account`

**Billing:** `GET,POST,DELETE /api/billing/subscription` · `POST /api/billing/verify` · `POST /api/billing/webhook`

**Platform admin:** `/api/admin/platform/{feature-flags,impersonate,search,subscription}`

## Enum reference (selected)

- **UserRole:** ADMIN, MANAGER, REP
- **LeadGrade:** A, B, C, D, E, F
- **SalesCycle:** SAME_DAY, THREE_DAYS, TWO_WEEKS, FOUR_WEEKS, THREE_MONTHS, OVER_THREE_MONTHS
- **NotifType:** AT_RISK, FOLLOW_UP_DUE, MISSED, RECOVERY, EXEC_SCORE_LOW, REP_SCORE_DROP
- **WinReason:** COMPETITIVE_PRICE, BEST_FIT, REFERRAL_TRUST, FAST_DELIVERY, EXISTING_RELATIONSHIP, OTHER
- **LossReason:** PRICE_TOO_HIGH, WENT_COMPETITOR, NO_BUDGET, NO_RESPONSE, REQUIREMENT_CHANGED, WRONG_FIT, OTHER
- **PlatformRole:** SUPER_ADMIN, SUPPORT
- **AccountEventType:** SIGNUP, ICP_CONFIGURED, WORKSPACE_CREATED, WORKSPACE_ARCHIVED, USER_INVITED, USER_JOINED, USER_DEACTIVATED, IMPORT_COMPLETED, IMPORT_FAILED, PLAN_CHANGED, TRIAL_STARTED, TRIAL_ENDED, PAYMENT_SUCCEEDED, PAYMENT_FAILED, FEATURE_FLAG_CHANGED, IMPERSONATED

---

*This document reflects the codebase as of July 2026. When code and copy disagree, code wins. For the go-live checklist (Razorpay secret rotation, env vars, webhook, plan sync), see the billing setup notes.*
