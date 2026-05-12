// Seed 4 demo reps + realistic activity so /rep-tracking renders with data
// matching the reference design (top performer, KPI deltas, score bars).
//
// Usage:  node scripts/seed-rep-tracking-demo.js [target-email]
//         (defaults to e2e@leadkaun.test)
//
// Idempotent: re-running re-creates rep users from scratch, re-distributes
// leads, and replaces this-month follow-up actions.

const fs   = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env.local');
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?/);
  if (m) process.env[m[1]] = m[2];
}

const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg }     = require('@prisma/adapter-pg');
const { Pool }         = require('pg');

const TARGET_EMAIL = process.argv[2] || 'e2e@leadkaun.test';

// ─── Reps + per-rep KPI targets ──────────────────────────────────────────
// API output formulas:
//   revenue_recovered       = SUM(won_value) for leads won this month
//   response_time_seconds   = AVG(speed_to_lead_hours) * 3600 over grade-A leads
//                             with first_contact_at this month
//   follow_up_completion_pct= completed / (completed + overdue) for actions
//                             with completed_at|due_date this month
const REPS = [
  // Top performer first — drives the bottom Trophy card
  {
    email: 'neha.sharma@e2e.leadkaun.test',  first: 'Neha',  last: 'Sharma',
    revenueLakhs:    4.20,            // ₹4,20,000 split across N won leads
    wonCount:        4,
    avgResponseHrs:  2.4,
    gradeACount:     5,
    completed:       23,
    overdue:         2,                // 23/(23+2) = 92%
  },
  {
    email: 'rohit.verma@e2e.leadkaun.test',  first: 'Rohit', last: 'Verma',
    revenueLakhs:    3.10,
    wonCount:        3,
    avgResponseHrs:  3.1,
    gradeACount:     4,
    completed:       22,
    overdue:         3,                // 88%
  },
  {
    email: 'arjun.mehta@e2e.leadkaun.test',  first: 'Arjun', last: 'Mehta',
    revenueLakhs:    2.85,
    wonCount:        3,
    avgResponseHrs:  2.8,
    gradeACount:     4,
    completed:       17,
    overdue:         3,                // 85%
  },
  {
    email: 'priya.nair@e2e.leadkaun.test',   first: 'Priya', last: 'Nair',
    revenueLakhs:    1.95,
    wonCount:        2,
    avgResponseHrs:  4.2,
    gradeACount:     3,
    completed:       14,
    overdue:         4,                // 78%
  },
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
    const owner = await prisma.user.findFirst({
      where:   { email: TARGET_EMAIL },
      include: { account: true },
    });
    if (!owner) throw new Error(`User ${TARGET_EMAIL} not found — run e2e-provision first`);
    const accountId = owner.account_id;
    console.log(`Target account: ${accountId} (${owner.account.name})`);

    const now           = new Date();
    const monthStart    = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd      = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysInMonth   = (monthEnd - monthStart) / 86_400_000;

    // ── 1) Wipe existing demo reps (idempotency) ──────────────────────────
    const existingReps = await prisma.user.findMany({
      where: { account_id: accountId, email: { in: REPS.map(r => r.email) } },
    });
    for (const u of existingReps) {
      // Detach lead assignments + delete this-month follow-ups owned by them
      await prisma.followUpAction.deleteMany({
        where: { account_id: accountId, assigned_rep_id: u.id, due_date: { gte: monthStart } },
      });
      await prisma.lead.updateMany({
        where: { account_id: accountId, assigned_rep_id: u.id },
        data:  { assigned_rep_id: null, won_at: null, won_value: null,
                 first_contact_at: null, speed_to_lead_hours: null },
      });
      await prisma.user.delete({ where: { id: u.id } });
      try { await admin.auth.admin.deleteUser(u.auth_id); } catch {}
    }
    // Cleanup orphan auth users with the same emails
    const { data: { users: allAuth } } = await admin.auth.admin.listUsers();
    for (const r of REPS) {
      const orphan = allAuth.find(u => u.email === r.email);
      if (orphan) { try { await admin.auth.admin.deleteUser(orphan.id); } catch {} }
    }

    // ── 2) Create 4 fresh rep users ────────────────────────────────────────
    const repRecords = [];
    for (const r of REPS) {
      const { data: authData, error: authErr } = await admin.auth.admin.createUser({
        email: r.email, password: 'DemoPass2026!', email_confirm: true,
      });
      if (authErr) throw authErr;
      const dbUser = await prisma.user.create({
        data: {
          account_id: accountId,
          auth_id:    authData.user.id,
          email:      r.email,
          first_name: r.first,
          last_name:  r.last,
          role:       'REP',
          is_active:  true,
        },
      });
      repRecords.push({ ...r, id: dbUser.id });
      console.log(`  ✓ rep ${r.first} ${r.last} (${dbUser.id})`);
    }

    // ── 3) Pull eligible leads (skip missed/won) ──────────────────────────
    const leads = await prisma.lead.findMany({
      where: {
        account_id: accountId,
        is_missed:  false,
        won_at:     null,
        lost_at:    null,
      },
      orderBy: { created_at: 'asc' },
    });
    console.log(`Eligible leads: ${leads.length}`);

    if (leads.length < 12) {
      console.warn('  ⚠ Only', leads.length, 'leads — won counts may not all be reachable.');
    }

    // ── 4) Round-robin assign every lead to a rep ──────────────────────────
    let cursor = 0;
    const perRepLeads = repRecords.map(() => []);
    for (const lead of leads) {
      perRepLeads[cursor % repRecords.length].push(lead);
      cursor++;
    }

    // ── 5) For each rep: mark wins, set grade-A response times, create follow-ups
    for (let i = 0; i < repRecords.length; i++) {
      const rep   = repRecords[i];
      const pool  = perRepLeads[i];
      console.log(`\nRep ${rep.first}: ${pool.length} leads in pool`);

      // Assign every lead in the pool to this rep
      await prisma.lead.updateMany({
        where: { id: { in: pool.map(l => l.id) } },
        data:  { assigned_rep_id: rep.id },
      });

      // 5a) Mark `wonCount` leads as won this month, distribute revenue evenly
      const wonSlice = pool.slice(0, Math.min(rep.wonCount, pool.length));
      const totalRupees = Math.round(rep.revenueLakhs * 1_00_000);
      const perWonRupees = Math.floor(totalRupees / wonSlice.length);
      for (let k = 0; k < wonSlice.length; k++) {
        const lead = wonSlice[k];
        // Spread won_at evenly across the month (day 5..25-ish)
        const dayOffset = 5 + Math.floor((k + 0.5) * (daysInMonth - 8) / wonSlice.length);
        const wonAt     = new Date(monthStart.getFullYear(), monthStart.getMonth(), dayOffset, 14, 0, 0);
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            won_at:    wonAt,
            won_value: k === wonSlice.length - 1
              ? totalRupees - perWonRupees * (wonSlice.length - 1)   // remainder
              : perWonRupees,
          },
        });
      }
      console.log(`  ✓ ${wonSlice.length} won, ₹${totalRupees.toLocaleString('en-IN')} total`);

      // 5b) Pick grade-A leads & set speed_to_lead_hours so the avg matches target
      const aSlice = pool.slice(wonSlice.length, wonSlice.length + rep.gradeACount);
      // Generate hours that average to target: spread ±0.5h symmetrically around target
      const hoursValues = [];
      for (let k = 0; k < aSlice.length; k++) {
        const offset = (k - (aSlice.length - 1) / 2) * 0.5;
        hoursValues.push(Math.max(0.1, +(rep.avgResponseHrs + offset).toFixed(2)));
      }
      // Adjust last value so sum/N exactly equals target (avoid float drift)
      const sumSoFar = hoursValues.slice(0, -1).reduce((a, b) => a + b, 0);
      hoursValues[hoursValues.length - 1] = +(rep.avgResponseHrs * aSlice.length - sumSoFar).toFixed(2);
      for (let k = 0; k < aSlice.length; k++) {
        const lead = aSlice[k];
        // first_contact_at = somewhere this month
        const firstContact = new Date(monthStart.getFullYear(), monthStart.getMonth(),
                                      3 + k * 2, 11, 0, 0);
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            grade:               'A',
            first_contact_at:    firstContact,
            speed_to_lead_hours: hoursValues[k],
          },
        });
      }
      console.log(`  ✓ ${aSlice.length} grade-A leads, hours: [${hoursValues.join(', ')}] avg=${rep.avgResponseHrs}h`);

      // 5c) Create follow-up actions: rep.completed COMPLETED + rep.overdue OVERDUE
      // Cycle through pool for lead_id (need a lead per action). If pool < count, reuse.
      const fuPool = pool.length > 0 ? pool : leads;
      const fuActions = [];
      for (let k = 0; k < rep.completed; k++) {
        const lead = fuPool[k % fuPool.length];
        const dueDay = 1 + (k % Math.floor(daysInMonth));
        const due    = new Date(monthStart.getFullYear(), monthStart.getMonth(), dueDay, 10, 0, 0);
        const done   = new Date(due.getTime() + (1 + (k % 6)) * 3_600_000);
        fuActions.push({
          account_id:      accountId,
          lead_id:         lead.id,
          assigned_rep_id: rep.id,
          day_number:      1 + (k % 7),
          action_type:     k % 2 === 0 ? 'CALL' : 'WHATSAPP',
          due_date:        due,
          status:          'COMPLETED',
          completed_at:    done,
          completed_by:    rep.id,
        });
      }
      for (let k = 0; k < rep.overdue; k++) {
        const lead = fuPool[k % fuPool.length];
        const dueDay = 1 + (k % Math.floor(daysInMonth));
        const due    = new Date(monthStart.getFullYear(), monthStart.getMonth(), dueDay, 10, 0, 0);
        fuActions.push({
          account_id:      accountId,
          lead_id:         lead.id,
          assigned_rep_id: rep.id,
          day_number:      1 + (k % 7),
          action_type:     'CALL',
          due_date:        due,
          status:          'OVERDUE',
          is_overdue:      true,
        });
      }
      await prisma.followUpAction.createMany({ data: fuActions });
      console.log(`  ✓ ${rep.completed} completed + ${rep.overdue} overdue follow-ups`);
    }

    // ── 6) Summary ────────────────────────────────────────────────────────
    console.log('\n=== Done. Expected page values ===');
    let revTotal = 0;
    for (const r of REPS) {
      const pct = Math.round((r.completed / (r.completed + r.overdue)) * 100);
      console.log(`  ${r.first.padEnd(7)} ₹${(r.revenueLakhs * 100000).toLocaleString('en-IN').padStart(10)}` +
                  `   ${r.avgResponseHrs}h   ${pct}% completion`);
      revTotal += r.revenueLakhs * 100000;
    }
    console.log(`  TOTAL   ₹${revTotal.toLocaleString('en-IN')} recovered this month`);
    console.log(`\nReload /rep-tracking to see populated stats.`);
  } catch (e) {
    console.error('SEED FAILED:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
