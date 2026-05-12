// Seed 8 leads as is_missed=true with varied missed_at timestamps + grades,
// so the Missed Opportunity Engine page renders with realistic data covering
// the 4-tier model (A=24h, B=48h, C=7d, D=30d).
// Usage: node scripts/seed-missed-leads.js [target-email]

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

const TARGET_EMAIL = process.argv[2] || 'e2e@leadkaun.test';

(async () => {
  const pool   = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const user = await prisma.user.findFirst({ where: { email: TARGET_EMAIL }, include: { account: true } });
    if (!user) throw new Error(`User ${TARGET_EMAIL} not found`);
    console.log(`Target account: ${user.account.id} (${user.account.name})`);

    // Pick the 8 highest-value leads in this account that aren't already missed
    const candidates = await prisma.lead.findMany({
      where: {
        account_id: user.account_id,
        is_missed:  false,
        is_junk:    false,
        won_at:     null,
        lost_at:    null,
        expected_value: { gt: 0 },
      },
      orderBy: { expected_value: "desc" },
      take: 8,
    });

    if (candidates.length === 0) {
      console.log("No candidates found. Account has no leads — run e2e-provision + import first.");
      return;
    }

    // 4-tier mix:
    //   A: 0.5d (just crossed) + 3d (deep)        — visible in today's window
    //   B: 2.5d + 5d                              — drives 7-day trend
    //   C: 8d + 14d                               — long tail
    //   D: 33d + 60d                              — historical at-risk pool
    const recipe = [
      { grade: "A", daysAgo: 0.5 },
      { grade: "A", daysAgo: 3   },
      { grade: "B", daysAgo: 2.5 },
      { grade: "B", daysAgo: 5   },
      { grade: "C", daysAgo: 8   },
      { grade: "C", daysAgo: 14  },
      { grade: "D", daysAgo: 33  },
      { grade: "D", daysAgo: 60  },
    ];
    const now = Date.now();

    let count = 0;
    for (let i = 0; i < candidates.length; i++) {
      const lead = candidates[i];
      const r = recipe[i] ?? { grade: lead.grade ?? "B", daysAgo: 14 };
      const missedAt = new Date(now - r.daysAgo * 86_400_000);
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          grade:     r.grade,
          is_missed: true,
          missed_at: missedAt,
        },
      });
      console.log(`  ✓ ${r.grade} · ${lead.first_name} ${lead.last_name||''} (${lead.company_name||'?'}) — missed ${r.daysAgo}d ago, ₹${lead.expected_value?.toLocaleString('en-IN')}`);
      count++;
    }

    const totalValue = candidates.reduce((s, l) => s + (l.expected_value ?? 0), 0);
    console.log(`\n✓ Marked ${count} leads as missed across A/B/C/D · Total ₹${totalValue.toLocaleString('en-IN')} at risk`);
  } catch (e) {
    console.error("FAILED:", e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
