// Clone the E2E-imported leads into another account's namespace.
// Usage: node scripts/copy-leads-to-account.js <target-email>
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?/);
  if (m) process.env[m[1]] = m[2];
}

const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { Pool }         = require('pg');

const TARGET_EMAIL = process.argv[2] || 'ajsal@frameleads.com';
const SOURCE_EMAIL = 'e2e@leadkaun.test';

(async () => {
  const pool   = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const [target, source] = await Promise.all([
      prisma.user.findFirst({ where: { email: TARGET_EMAIL }, include: { account: true } }),
      prisma.user.findFirst({ where: { email: SOURCE_EMAIL }, include: { account: true } }),
    ]);
    if (!target) throw new Error(`Target user ${TARGET_EMAIL} not found`);
    if (!source) throw new Error(`Source user ${SOURCE_EMAIL} not found`);

    console.log(`Source account: ${source.account.id} (${source.account.name})`);
    console.log(`Target account: ${target.account.id} (${target.account.name})`);

    // Read source leads (only fresh ones — not won/lost/junk)
    const srcLeads = await prisma.lead.findMany({
      where: { account_id: source.account_id, is_junk: false },
      orderBy: { created_at: 'asc' },
    });
    console.log(`Found ${srcLeads.length} leads to copy`);

    // Pick target account's "IndiaMART" source (best B2B match) + "New Inquiry" stage
    const targetSource = await prisma.leadSource.findFirst({
      where: { account_id: target.account_id, key: 'indiamart' },
    }) || await prisma.leadSource.findFirst({
      where: { account_id: target.account_id }, orderBy: { name: 'asc' },
    });
    const targetStage = await prisma.pipelineStage.findFirst({
      where: { account_id: target.account_id, key: 'new_inquiry' },
    }) || await prisma.pipelineStage.findFirst({
      where: { account_id: target.account_id }, orderBy: { display_order: 'asc' },
    });
    if (!targetSource || !targetStage) {
      throw new Error(`Target account missing sources or stages`);
    }
    console.log(`Mapping source → ${targetSource.name} (${targetSource.id})`);
    console.log(`Mapping stage  → ${targetStage.name}  (${targetStage.id})`);

    let inserted = 0;
    let skipped  = 0;
    for (const lead of srcLeads) {
      // Skip if a lead with this phone already exists in target account
      const dup = await prisma.lead.findUnique({
        where: { account_id_phone: { account_id: target.account_id, phone: lead.phone } },
      });
      if (dup) { skipped++; continue; }

      try {
        await prisma.$transaction(async (tx) => {
          await tx.lead.create({
            data: {
              account_id:              target.account_id,
              first_name:              lead.first_name,
              last_name:               lead.last_name,
              phone:                   lead.phone,
              phone_raw:               lead.phone_raw,
              email:                   lead.email,
              company_name:            lead.company_name,
              designation:             lead.designation,
              city:                    lead.city,
              state:                   lead.state,
              pincode:                 lead.pincode,
              source_id:               targetSource.id,
              stage_id:                targetStage.id,
              inquiry_text:            lead.inquiry_text,
              expected_value:          lead.expected_value,
              fit_score:               lead.fit_score,
              intent_score:            lead.intent_score,
              quality_score:           lead.quality_score,
              grade:                   lead.grade,
              fit_score_breakdown:     lead.fit_score_breakdown,
              quality_score_breakdown: lead.quality_score_breakdown,
              signals: {
                create: {
                  account_id:           target.account_id,
                  signal_type:          'SOURCE_BASELINE',
                  signal_value:         targetSource.intent_baseline,
                  raw_value:            { source_key: targetSource.key, copied_from: source.account_id },
                  lead_grade_at_signal: lead.grade,
                  intent_score_before:  0,
                  intent_score_after:   lead.intent_score,
                },
              },
            },
          });
        });
        inserted++;
      } catch (e) {
        console.error(`  ✗ ${lead.first_name} ${lead.last_name||''}:`, e.message.slice(0,120));
      }
    }
    console.log(`\n✓ Inserted ${inserted} leads · skipped ${skipped} duplicates`);
    const finalCount = await prisma.lead.count({ where: { account_id: target.account_id } });
    console.log(`✓ Target account total: ${finalCount} leads`);
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
