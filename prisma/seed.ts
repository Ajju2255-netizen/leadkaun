import { PrismaClient, LeadGrade, FollowUpType } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// ─────────────────────────────────────────────
// PIPELINE STAGES
// ─────────────────────────────────────────────

const PIPELINE_STAGES = [
  { name: "New Inquiry",      key: "new_inquiry",      display_order: 1, is_terminal: false, is_won: false, is_lost: false },
  { name: "Contacted",        key: "contacted",         display_order: 2, is_terminal: false, is_won: false, is_lost: false },
  { name: "Qualified",        key: "qualified",         display_order: 3, is_terminal: false, is_won: false, is_lost: false },
  { name: "Proposal Sent",    key: "proposal_sent",     display_order: 4, is_terminal: false, is_won: false, is_lost: false },
  { name: "Negotiation",      key: "negotiation",       display_order: 5, is_terminal: false, is_won: false, is_lost: false },
  { name: "Follow-up",        key: "follow_up",         display_order: 6, is_terminal: false, is_won: false, is_lost: false },
  { name: "Won",              key: "won",               display_order: 7, is_terminal: true,  is_won: true,  is_lost: false },
  { name: "Lost",             key: "lost",              display_order: 8, is_terminal: true,  is_won: false, is_lost: true  },
]

// ─────────────────────────────────────────────
// LEAD SOURCES — 26 per PRD Appendix C
// ─────────────────────────────────────────────

const LEAD_SOURCES = [
  // High-intent digital sources
  { name: "Google Ads",             key: "google_ads",           intent_baseline: 55, reliability_score: 90.0,  is_custom: false },
  { name: "Google Organic SEO",     key: "google_organic",       intent_baseline: 65, reliability_score: 95.0,  is_custom: false },
  { name: "Facebook Ads",           key: "facebook_ads",         intent_baseline: 35, reliability_score: 75.0,  is_custom: false },
  { name: "Instagram Ads",          key: "instagram_ads",        intent_baseline: 30, reliability_score: 70.0,  is_custom: false },
  { name: "LinkedIn Ads",           key: "linkedin_ads",         intent_baseline: 50, reliability_score: 85.0,  is_custom: false },
  { name: "LinkedIn Organic",       key: "linkedin_organic",     intent_baseline: 55, reliability_score: 88.0,  is_custom: false },
  { name: "YouTube Ads",            key: "youtube_ads",          intent_baseline: 35, reliability_score: 72.0,  is_custom: false },
  { name: "WhatsApp Business",      key: "whatsapp_business",    intent_baseline: 60, reliability_score: 88.0,  is_custom: false },
  { name: "JustDial",               key: "justdial",             intent_baseline: 50, reliability_score: 80.0,  is_custom: false },
  { name: "IndiaMART",              key: "indiamart",            intent_baseline: 60, reliability_score: 85.0,  is_custom: false },
  { name: "TradeIndia",             key: "tradeindia",           intent_baseline: 55, reliability_score: 80.0,  is_custom: false },
  { name: "Sulekha",                key: "sulekha",              intent_baseline: 45, reliability_score: 75.0,  is_custom: false },
  { name: "Website Contact Form",   key: "website_contact_form", intent_baseline: 65, reliability_score: 92.0,  is_custom: false },
  { name: "Website Chat",           key: "website_chat",         intent_baseline: 70, reliability_score: 93.0,  is_custom: false },
  { name: "Website Demo Request",   key: "website_demo_request", intent_baseline: 80, reliability_score: 95.0,  is_custom: false },
  { name: "Referral",               key: "referral",             intent_baseline: 75, reliability_score: 96.0,  is_custom: false },
  { name: "Cold Call Outbound",     key: "cold_call_outbound",   intent_baseline: 20, reliability_score: 65.0,  is_custom: false },
  { name: "Email Campaign",         key: "email_campaign",       intent_baseline: 30, reliability_score: 70.0,  is_custom: false },
  { name: "SMS Campaign",           key: "sms_campaign",         intent_baseline: 20, reliability_score: 60.0,  is_custom: false },
  { name: "Exhibition / Event",     key: "exhibition_event",     intent_baseline: 55, reliability_score: 82.0,  is_custom: false },
  { name: "Walk-in",                key: "walk_in",              intent_baseline: 70, reliability_score: 90.0,  is_custom: false },
  { name: "Newspaper / Print Ad",   key: "newspaper_print",      intent_baseline: 30, reliability_score: 65.0,  is_custom: false },
  { name: "TV / Radio Ad",          key: "tv_radio",             intent_baseline: 25, reliability_score: 60.0,  is_custom: false },
  { name: "Partner / Reseller",     key: "partner_reseller",     intent_baseline: 65, reliability_score: 88.0,  is_custom: false },
  { name: "Re-inquiry",             key: "re_inquiry",           intent_baseline: 50, reliability_score: 82.0,  is_custom: false },
  { name: "Other",                  key: "other",                intent_baseline: 10, reliability_score: 50.0,  is_custom: false },
]

// ─────────────────────────────────────────────
// FOLLOW-UP CONFIGS — per grade
// ─────────────────────────────────────────────

// Schedule: array of { day: number, type: "CALL" | "WHATSAPP" }
// A-grade: aggressive — call D1, WA D2, call D3, WA D5, call D7, WA D10, call D14
// B-grade: balanced — call D1, WA D3, call D5, WA D7, call D10, WA D14
// C-grade: light — WA D1, call D3, WA D7, call D14
// D-grade: minimal — WA D2, call D7, WA D14
// E-grade: no config needed (system default: one WA D3)

const FOLLOW_UP_CONFIGS: { grade: LeadGrade; schedule: { day: number; type: FollowUpType }[] }[] = [
  {
    grade: "A",
    schedule: [
      { day: 1,  type: "CALL" },
      { day: 2,  type: "WHATSAPP" },
      { day: 3,  type: "CALL" },
      { day: 5,  type: "WHATSAPP" },
      { day: 7,  type: "CALL" },
      { day: 10, type: "WHATSAPP" },
      { day: 14, type: "CALL" },
    ],
  },
  {
    grade: "B",
    schedule: [
      { day: 1,  type: "CALL" },
      { day: 3,  type: "WHATSAPP" },
      { day: 5,  type: "CALL" },
      { day: 7,  type: "WHATSAPP" },
      { day: 10, type: "CALL" },
      { day: 14, type: "WHATSAPP" },
    ],
  },
  {
    grade: "C",
    schedule: [
      { day: 1,  type: "WHATSAPP" },
      { day: 3,  type: "CALL" },
      { day: 7,  type: "WHATSAPP" },
      { day: 14, type: "CALL" },
    ],
  },
  {
    grade: "D",
    schedule: [
      { day: 2,  type: "WHATSAPP" },
      { day: 7,  type: "CALL" },
      { day: 14, type: "WHATSAPP" },
    ],
  },
]

// ─────────────────────────────────────────────
// SMART TEMPLATES — 6 starters
// ─────────────────────────────────────────────

const SMART_TEMPLATES = [
  {
    name: "First Contact — Introduction",
    type: "WHATSAPP" as const,
    stages: ["new_inquiry"],
    grades: ["A", "B", "C"] as LeadGrade[],
    body: "Hi {{first_name}}, this is {{rep_name}} from {{company_name}}. Thanks for your inquiry about {{inquiry_topic}}. I'd love to understand your requirements better — would you be available for a quick call today or tomorrow?",
    is_active: true,
  },
  {
    name: "Proposal Follow-up",
    type: "WHATSAPP" as const,
    stages: ["proposal_sent"],
    grades: ["A", "B"] as LeadGrade[],
    body: "Hi {{first_name}}, I wanted to follow up on the proposal I shared earlier. Have you had a chance to review it? Happy to answer any questions or adjust the scope to better fit your budget.",
    is_active: true,
  },
  {
    name: "Re-engagement — Stalled Lead",
    type: "WHATSAPP" as const,
    stages: ["follow_up", "negotiation"],
    grades: ["A", "B", "C"] as LeadGrade[],
    body: "Hi {{first_name}}, it's been a while since we spoke. We've recently {{value_add}} that might be relevant to what you were looking for. Would you like to reconnect for a quick update?",
    is_active: true,
  },
  {
    name: "Call Script — Initial Discovery",
    type: "CALL_SCRIPT" as const,
    stages: ["new_inquiry", "contacted"],
    grades: ["A", "B", "C", "D"] as LeadGrade[],
    body: `OPENING: "Hi, am I speaking with {{first_name}}? This is {{rep_name}} from {{company_name}}. You had recently enquired about {{inquiry_topic}} — is this a good time to talk for 5 minutes?"

DISCOVERY:
1. What specifically are you looking for?
2. What's your timeline?
3. Have you looked at other options?
4. What's your approximate budget range?

CLOSE: "Based on what you've shared, I think we can definitely help. Let me send you a detailed proposal by [date]. Can I confirm your email?"`,
    is_active: true,
  },
  {
    name: "Call Script — Negotiation",
    type: "CALL_SCRIPT" as const,
    stages: ["negotiation"],
    grades: ["A", "B"] as LeadGrade[],
    body: `OPENING: "Hi {{first_name}}, following up on our conversation about pricing. I've spoken with my team and I have an update for you."

KEY POINTS:
- Acknowledge their concern about price
- Highlight the unique value they get
- Offer one concrete alternative (payment terms, scope adjustment)
- Never discount more than once

CLOSE: "Can we move forward with this? I can have the agreement ready today itself."`,
    is_active: true,
  },
  {
    name: "WhatsApp — Callback Confirmation",
    type: "WHATSAPP" as const,
    stages: ["contacted", "qualified"],
    grades: ["A", "B", "C"] as LeadGrade[],
    body: "Hi {{first_name}}, confirming our call scheduled for {{callback_time}}. I'll call you on {{phone}}. Looking forward to speaking with you!",
    is_active: true,
  },
]

// ─────────────────────────────────────────────
// SEED — uses a demo account
// ─────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding database...")

  // Create a demo account for testing
  const demoAccount = await prisma.account.upsert({
    where: { id: "demo_account_seed" },
    update: {},
    create: {
      id: "demo_account_seed",
      name: "Demo Company",
      industry: "Real Estate",
      city: "Mumbai",
      state: "Maharashtra",
      team_size: "SMALL",
      monthly_lead_vol: "BETWEEN_50_200",
      icp_configured: false,
    },
  })

  console.log(`✓ Demo account: ${demoAccount.name}`)

  // Seed pipeline stages
  for (const stage of PIPELINE_STAGES) {
    await prisma.pipelineStage.upsert({
      where: { account_id_key: { account_id: demoAccount.id, key: stage.key } },
      update: { name: stage.name, display_order: stage.display_order },
      create: { ...stage, account_id: demoAccount.id },
    })
  }
  console.log(`✓ Pipeline stages: ${PIPELINE_STAGES.length}`)

  // Seed lead sources
  for (const source of LEAD_SOURCES) {
    await prisma.leadSource.upsert({
      where: { account_id_key: { account_id: demoAccount.id, key: source.key } },
      update: { name: source.name, intent_baseline: source.intent_baseline, reliability_score: source.reliability_score },
      create: { ...source, account_id: demoAccount.id },
    })
  }
  console.log(`✓ Lead sources: ${LEAD_SOURCES.length}`)

  // Seed follow-up configs
  for (const config of FOLLOW_UP_CONFIGS) {
    await prisma.followUpConfig.upsert({
      where: { account_id_grade: { account_id: demoAccount.id, grade: config.grade } },
      update: { schedule: config.schedule as object },
      create: {
        account_id: demoAccount.id,
        grade: config.grade,
        schedule: config.schedule as object,
      },
    })
  }
  console.log(`✓ Follow-up configs: ${FOLLOW_UP_CONFIGS.length} grades`)

  // Seed smart templates
  for (const template of SMART_TEMPLATES) {
    const existing = await prisma.smartTemplate.findFirst({
      where: { account_id: demoAccount.id, name: template.name },
    })
    if (!existing) {
      await prisma.smartTemplate.create({
        data: { ...template, account_id: demoAccount.id },
      })
    }
  }
  console.log(`✓ Smart templates: ${SMART_TEMPLATES.length}`)

  console.log("✅ Seed complete.")
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
