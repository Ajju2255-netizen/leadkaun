// E2E test user provisioner — run from project root: node scripts/e2e-provision.js
// Loads env from .env.local manually (no dotenv dependency needed).

const fs   = require('fs');
const path = require('path');

// Manual .env.local loader
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?/);
  if (m) process.env[m[1]] = m[2];
}

const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { Pool }         = require('pg');

const EMAIL    = 'e2e@leadkaun.test';
const PASSWORD = 'E2EPass2026!';
const ORG_NAME = 'E2E Test Co';

const PIPELINE_STAGES = [
  { name: "New Inquiry",   key: "new_inquiry",   display_order: 1, is_terminal: false, is_won: false, is_lost: false },
  { name: "Contacted",     key: "contacted",      display_order: 2, is_terminal: false, is_won: false, is_lost: false },
  { name: "Qualified",     key: "qualified",      display_order: 3, is_terminal: false, is_won: false, is_lost: false },
  { name: "Proposal Sent", key: "proposal_sent",  display_order: 4, is_terminal: false, is_won: false, is_lost: false },
  { name: "Negotiation",   key: "negotiation",    display_order: 5, is_terminal: false, is_won: false, is_lost: false },
  { name: "Follow-up",     key: "follow_up",      display_order: 6, is_terminal: false, is_won: false, is_lost: false },
  { name: "Won",           key: "won",            display_order: 7, is_terminal: true,  is_won: true,  is_lost: false },
  { name: "Lost",          key: "lost",           display_order: 8, is_terminal: true,  is_won: false, is_lost: true  },
];

const LEAD_SOURCES = [
  { name: "Google Ads",           key: "google_ads",           intent_baseline: 55, reliability_score: 90.0,  is_custom: false },
  { name: "Google Organic SEO",   key: "google_organic",       intent_baseline: 65, reliability_score: 95.0,  is_custom: false },
  { name: "Facebook Ads",         key: "facebook_ads",         intent_baseline: 35, reliability_score: 75.0,  is_custom: false },
  { name: "LinkedIn Ads",         key: "linkedin_ads",         intent_baseline: 50, reliability_score: 85.0,  is_custom: false },
  { name: "Website Contact Form", key: "website_contact_form", intent_baseline: 65, reliability_score: 92.0,  is_custom: false },
  { name: "WhatsApp Business",    key: "whatsapp_business",    intent_baseline: 60, reliability_score: 88.0,  is_custom: false },
  { name: "JustDial",             key: "justdial",             intent_baseline: 50, reliability_score: 80.0,  is_custom: false },
  { name: "IndiaMART",            key: "indiamart",            intent_baseline: 60, reliability_score: 85.0,  is_custom: false },
  { name: "Referral",             key: "referral",             intent_baseline: 75, reliability_score: 96.0,  is_custom: false },
  { name: "Walk-in",              key: "walk_in",              intent_baseline: 70, reliability_score: 90.0,  is_custom: false },
  { name: "Other",                key: "other",                intent_baseline: 10, reliability_score: 50.0,  is_custom: false },
];

(async () => {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const pool   = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    // ── Cleanup any prior E2E user (idempotent) ────────────────────────────
    const existingDb = await prisma.user.findFirst({ where: { email: EMAIL }, include: { account: true } });
    if (existingDb) {
      console.log(`Cleaning up previous E2E account ${existingDb.account_id}…`);
      await prisma.signal.deleteMany({ where: { account_id: existingDb.account_id } });
      await prisma.followUp.deleteMany({ where: { lead: { account_id: existingDb.account_id } } });
      await prisma.leadNote.deleteMany({ where: { lead: { account_id: existingDb.account_id } } });
      await prisma.lead.deleteMany({ where: { account_id: existingDb.account_id } });
      await prisma.importJobStatus.deleteMany({ where: { account_id: existingDb.account_id } });
      await prisma.notification.deleteMany({ where: { account_id: existingDb.account_id } });
      await prisma.followUpConfig.deleteMany({ where: { account_id: existingDb.account_id } });
      await prisma.smartTemplate.deleteMany({ where: { account_id: existingDb.account_id } });
      await prisma.customField.deleteMany({ where: { account_id: existingDb.account_id } });
      await prisma.user.deleteMany({ where: { account_id: existingDb.account_id } });
      await prisma.leadSource.deleteMany({ where: { account_id: existingDb.account_id } });
      await prisma.pipelineStage.deleteMany({ where: { account_id: existingDb.account_id } });
      await prisma.account.delete({ where: { id: existingDb.account_id } });
      try { await admin.auth.admin.deleteUser(existingDb.auth_id); } catch {}
    }
    // Cleanup orphaned auth user (not in our DB)
    const { data: { users } } = await admin.auth.admin.listUsers();
    const orphan = users.find(u => u.email === EMAIL);
    if (orphan) {
      console.log(`Cleaning up orphan supabase auth user ${orphan.id}…`);
      await admin.auth.admin.deleteUser(orphan.id);
    }

    // ── Create fresh ──────────────────────────────────────────────────────
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: EMAIL, password: PASSWORD, email_confirm: true,
    });
    if (authError) throw authError;
    console.log(`✓ Auth user ${authData.user.id}`);

    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.account.create({
        data: {
          name: ORG_NAME,
          industry: "Real Estate",
          city: "Mumbai",
          state: "Maharashtra",
          team_size: "SMALL",
          monthly_lead_vol: "BETWEEN_50_200",
          icp_configured: true,
          icp_industries: ["Real Estate", "EdTech", "BFSI", "SaaS", "Manufacturing"],
          icp_states:     ["Maharashtra", "Karnataka", "Tamil Nadu", "Telangana", "Delhi", "Haryana"],
          icp_business_types: ["B2B", "B2C", "Both"],
          icp_roles:          ["Founder/CEO", "Director", "Manager", "Head"],
          icp_budget_min: 50000,
          icp_budget_max: 100000000,
        },
      });
      const user = await tx.user.create({
        data: {
          account_id: account.id,
          auth_id: authData.user.id,
          email: EMAIL,
          first_name: "E2E",
          last_name: "Tester",
          role: "ADMIN",
        },
      });
      await tx.pipelineStage.createMany({
        data: PIPELINE_STAGES.map((s) => ({ ...s, account_id: account.id })),
      });
      await tx.leadSource.createMany({
        data: LEAD_SOURCES.map((s) => ({ ...s, account_id: account.id })),
      });
      return { account, user };
    });

    console.log(`✓ Account ${result.account.id} (${ORG_NAME})`);
    console.log(`✓ User    ${result.user.id} (${EMAIL})`);
    console.log(`✓ ICP pre-configured · ${PIPELINE_STAGES.length} stages · ${LEAD_SOURCES.length} sources`);
    console.log('');
    console.log(`READY FOR LOGIN: ${EMAIL} / ${PASSWORD}`);
  } catch (e) {
    console.error('PROVISION FAILED:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
