// LOCAL-ONLY dummy data seeder — populates the localhost DB with reps, leads,
// wins, follow-ups and missed leads so every page (Queue, Leads, Rep Tracking,
// Missed) renders with realistic data.
//
// SAFETY: talks ONLY to the local Postgres in .env.local (DATABASE_URL). It does
// NOT touch Supabase / auth / anything remote. It refuses to run unless the URL
// is localhost. Reps are DB-only rows (they can't log in — fine for testing).
//
// Idempotent: re-running wipes the dummy reps + dummy leads (tagged
// custom_values.seed = "dummy-local") and their follow-ups, then recreates.
//
// Usage:  node scripts/seed-dummy-local.js

const fs = require("fs")
const path = require("path")
for (const line of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const DB = process.env.DATABASE_URL || ""
if (!/localhost|127\.0\.0\.1|\/tmp/.test(DB)) {
  console.error("REFUSING TO RUN: DATABASE_URL is not localhost:", DB.replace(/:\/\/[^@]*@/, "://***@"))
  process.exit(1)
}

const { PrismaClient } = require("@prisma/client")
const { PrismaPg } = require("@prisma/adapter-pg")
const { Pool } = require("pg")

const TAG = "dummy-local"
const FIRST = ["Rahul","Priya","Arjun","Sneha","Vikram","Anjali","Deepak","Harsha","Neha","Rakesh","Sanjay","Amit","Pooja","Naveen","Rohit","Manoj","Aisha","Suresh","Joseph","Divya","Karan","Meera","Farhan","Kavita"]
const LAST = ["Sharma","Nair","Menon","Patel","Singh","Rao","Kumar","Reddy","Kapoor","Jain","Gupta","Verma","Shah","Iyer","Khan","Thomas","Mathew","Babu"]
const COMPANIES = ["Shakti Industries","GreenBuild Infra","HealthPlus Hospitals","Swift Logistics","NextGen AI","RetailHub India","Prime Packaging","SteelTech Industries","Dream Homes Realty","Precision Auto Components","Metro Fabrication","Sunrise Textiles","Apex Manufacturing","BlueOcean Exports","Urban Realty","MediCare Labs"]
const CITIES = [["Bangalore","Karnataka"],["Mumbai","Maharashtra"],["Chennai","Tamil Nadu"],["Pune","Maharashtra"],["Hyderabad","Telangana"],["Ahmedabad","Gujarat"],["Delhi","Delhi"],["Kochi","Kerala"],["Jaipur","Rajasthan"],["Indore","Madhya Pradesh"]]
const GRADES = ["A","A","B","B","B","C","C","C","D","D","E"]

const REPS = [
  { first: "Neha",  last: "Sharma" },
  { first: "Rohit", last: "Verma" },
  { first: "Arjun", last: "Mehta" },
  { first: "Priya", last: "Nair" },
]

let SEED = 12345
const rand = () => { SEED = (SEED * 1103515245 + 12345) & 0x7fffffff; return SEED / 0x7fffffff }
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1))
const phone = () => "+91" + int(6, 9) + String(int(100000000, 999999999))
const daysAgo = (d) => new Date(Date.now() - d * 86400000)

;(async () => {
  const pool = new Pool({ connectionString: DB })
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
  try {
    const ws = await prisma.workspace.findFirst({ where: { is_default: true }, include: { account: true } })
    if (!ws) throw new Error("No default workspace found — run prisma/seed.ts first")
    const accountId = ws.account_id
    const workspaceId = ws.id
    console.log(`Target: ${ws.account.name} / ${ws.slug}  (local)`)

    const source = await prisma.leadSource.findFirst({ where: { workspace_id: workspaceId } })
    const stages = await prisma.pipelineStage.findMany({ where: { workspace_id: workspaceId } })
    const stageBy = (k) => (stages.find((s) => s.key === k) || stages[0]).id
    const openStages = stages.filter((s) => !["won", "lost"].includes(s.key)).map((s) => s.id)
    const wonStage = stageBy("won")

    // ── wipe prior dummy data ──
    const oldReps = await prisma.user.findMany({ where: { account_id: accountId, email: { endsWith: "@dummy.local" } } })
    const oldLeads = await prisma.lead.findMany({ where: { account_id: accountId }, select: { id: true, custom_values: true } })
    const dummyLeadIds = oldLeads.filter((l) => l.custom_values && l.custom_values.seed === TAG).map((l) => l.id)
    if (dummyLeadIds.length) {
      await prisma.followUpAction.deleteMany({ where: { lead_id: { in: dummyLeadIds } } })
      await prisma.signal.deleteMany({ where: { lead_id: { in: dummyLeadIds } } })
      await prisma.lead.deleteMany({ where: { id: { in: dummyLeadIds } } })
    }
    for (const u of oldReps) {
      await prisma.followUpAction.deleteMany({ where: { assigned_rep_id: u.id } })
      await prisma.user.delete({ where: { id: u.id } })
    }
    console.log(`  cleaned ${dummyLeadIds.length} old dummy leads, ${oldReps.length} old reps`)

    // ── reps (DB-only) ──
    const reps = []
    for (let i = 0; i < REPS.length; i++) {
      const r = REPS[i]
      const u = await prisma.user.create({
        data: {
          account_id: accountId, auth_id: `dummy-${TAG}-${i}-${Date.now()}`,
          email: `${r.first.toLowerCase()}.${r.last.toLowerCase()}@dummy.local`,
          first_name: r.first, last_name: r.last, role: "REP", is_active: true,
        },
      })
      reps.push(u.id)
      console.log(`  ✓ rep ${r.first} ${r.last}`)
    }

    // ── leads ──
    const N = 55
    let won = 0, contacted = 0, missed = 0, open = 0
    for (let i = 0; i < N; i++) {
      const [city, state] = pick(CITIES)
      const grade = pick(GRADES)
      const repId = reps[i % reps.length]
      const fit = int(20, 95), intent = int(15, 100), quality = int(35, 90)
      const base = {
        account_id: accountId, workspace_id: workspaceId,
        first_name: pick(FIRST), last_name: pick(LAST),
        phone: phone(), phone_raw: phone(),
        email: `lead${i}@example.com`, company_name: pick(COMPANIES),
        city, state, source_id: source.id,
        fit_score: fit, intent_score: intent, quality_score: quality, grade,
        expected_value: [200000, 500000, 1200000, 2500000, 750000][i % 5],
        assigned_rep_id: repId,
        imported_at: daysAgo(int(1, 150)),
        custom_values: { seed: TAG },
        inquiry_text: pick(["Requested demo", "Asked for pricing", "Site visit done", "Comparing vendors", "Ready to buy"]),
      }
      const roll = i % 5
      if (roll === 0) {
        // won — spread across last 120 days
        const w = daysAgo(int(3, 120))
        await prisma.lead.create({ data: { ...base, stage_id: wonStage, won_at: w, won_value: [150000, 300000, 450000, 800000, 250000][i % 5], first_contact_at: new Date(w.getTime() - 4 * 86400000), speed_to_lead_hours: +(rand() * 6 + 0.5).toFixed(1) } })
        won++
      } else if (roll === 1) {
        // grade-A contacted (drives response time)
        await prisma.lead.create({ data: { ...base, grade: "A", stage_id: stageBy("contacted"), first_contact_at: daysAgo(int(1, 60)), speed_to_lead_hours: +(rand() * 5 + 0.5).toFixed(1) } })
        contacted++
      } else if (roll === 2) {
        // missed
        await prisma.lead.create({ data: { ...base, stage_id: pick(openStages), is_missed: true, missed_at: daysAgo(int(2, 40)), last_action_at: daysAgo(int(20, 60)) } })
        missed++
      } else {
        // open (in queue)
        await prisma.lead.create({ data: { ...base, stage_id: pick(openStages), ...(rand() > 0.5 ? { first_contact_at: daysAgo(int(1, 30)), speed_to_lead_hours: +(rand() * 8 + 1).toFixed(1) } : {}) } })
        open++
      }
    }
    console.log(`  ✓ leads: ${won} won · ${contacted} grade-A contacted · ${missed} missed · ${open} open`)

    // ── follow-ups per rep (completed + overdue) ──
    const leadsByRep = {}
    for (const rid of reps) leadsByRep[rid] = (await prisma.lead.findMany({ where: { assigned_rep_id: rid, custom_values: { path: ["seed"], equals: TAG } }, select: { id: true } })).map((l) => l.id)
    for (let r = 0; r < reps.length; r++) {
      const rid = reps[r]
      const pool = leadsByRep[rid]
      if (!pool.length) continue
      const completed = 14 + r * 3, overdue = 2 + (r % 3)
      const actions = []
      for (let k = 0; k < completed; k++) {
        const due = daysAgo(int(1, 45))
        actions.push({ account_id: accountId, workspace_id: workspaceId, lead_id: pool[k % pool.length], assigned_rep_id: rid, day_number: 1 + (k % 7), action_type: k % 2 ? "WHATSAPP" : "CALL", due_date: due, status: "COMPLETED", completed_at: new Date(due.getTime() + 3600000 * int(1, 6)), completed_by: rid })
      }
      for (let k = 0; k < overdue; k++) {
        actions.push({ account_id: accountId, workspace_id: workspaceId, lead_id: pool[k % pool.length], assigned_rep_id: rid, day_number: 1 + (k % 7), action_type: "CALL", due_date: daysAgo(int(3, 20)), status: "OVERDUE", is_overdue: true })
      }
      await prisma.followUpAction.createMany({ data: actions })
    }
    console.log(`  ✓ follow-ups created for ${reps.length} reps`)
    console.log("\nDone. Reload the app (localhost:3000) — Queue, Leads, Rep Tracking, Missed now have data.")
  } catch (e) {
    console.error("SEED FAILED:", e)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
})()
