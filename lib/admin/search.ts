// ─────────────────────────────────────────────
// SUPPORT SEARCH — one box, every entity (Mission Control)
//
// Support's job is to reconstruct a story:
//   Account → User → Workspace → Lead → Intake → Import → Recommendation → Error
//
// So every result deep-links to the screen that continues that story, not
// generically back to the account. A phone number goes to the Lead Inspector; a
// session id goes to the intake state machine.
//
// Ids are matched exactly (paste a cuid from a log and it resolves); everything
// else is a case-insensitive contains.
// ─────────────────────────────────────────────

import { prisma } from "@/lib/prisma"

export type SearchHit = {
  id: string
  primary: string
  secondary: string | null
  tag: string
  href: string
}

export type SearchResults = {
  accounts: SearchHit[]
  users: SearchHit[]
  workspaces: SearchHit[]
  leads: SearchHit[]
  intakeSessions: SearchHit[]
  imports: SearchHit[]
  total: number
}

const EMPTY: SearchResults = {
  accounts: [], users: [], workspaces: [], leads: [], intakeSessions: [], imports: [], total: 0,
}

/** A cuid-ish token — worth trying as an exact id lookup. */
const looksLikeId = (s: string) => /^c[a-z0-9]{20,}$/i.test(s)

export async function platformSearch(q: string): Promise<SearchResults> {
  const term = q.trim()
  if (term.length < 2) return EMPTY
  const like = { contains: term, mode: "insensitive" as const }
  const byId = looksLikeId(term)

  const [accounts, users, workspaces, leads, sessions, imports] = await Promise.all([
    prisma.account.findMany({
      where: byId ? { id: term } : { OR: [{ name: like }, { city: like }] },
      take: 8, orderBy: { created_at: "desc" },
      select: { id: true, name: true, industry: true, city: true },
    }),
    prisma.user.findMany({
      where: byId ? { id: term } : { OR: [{ email: like }, { first_name: like }, { last_name: like }] },
      take: 8,
      select: { id: true, account_id: true, first_name: true, last_name: true, email: true, role: true, is_active: true },
    }),
    prisma.workspace.findMany({
      where: byId ? { id: term } : { OR: [{ name: like }, { slug: like }] },
      take: 6,
      select: { id: true, account_id: true, name: true, account: { select: { name: true } } },
    }),
    prisma.lead.findMany({
      where: byId
        ? { id: term }
        : {
            OR: [
              { first_name: like }, { last_name: like }, { company_name: like }, { email: like },
              { phone: { contains: term } }, { phone_raw: { contains: term } },
            ],
          },
      take: 12, orderBy: { imported_at: "desc" },
      select: {
        id: true, account_id: true, first_name: true, last_name: true,
        company_name: true, phone: true, grade: true, account: { select: { name: true } },
      },
    }),
    prisma.intakeSession.findMany({
      where: byId ? { id: term } : { OR: [{ sample_hash: term }, { engine_version: like }] },
      take: 6, orderBy: { created_at: "desc" },
      select: { id: true, account_id: true, rows: true, state: true, upload_source: true, created_at: true },
    }),
    prisma.importJobStatus.findMany({
      where: byId ? { id: term } : { OR: [{ file_name: like }, { name: like }] },
      take: 6, orderBy: { created_at: "desc" },
      select: { id: true, account_id: true, file_name: true, status: true, total_rows: true, inserted: true },
    }),
  ])

  const r: SearchResults = {
    accounts: accounts.map((a) => ({
      id: a.id,
      primary: a.name,
      secondary: [a.industry, a.city].filter(Boolean).join(" · ") || null,
      tag: "account",
      href: `/admin/accounts/${a.id}`,
    })),
    users: users.map((u) => ({
      id: u.id,
      primary: `${u.first_name} ${u.last_name ?? ""}`.trim() || u.email,
      secondary: `${u.email} · ${u.role}${u.is_active ? "" : " · inactive"}`,
      tag: "user",
      href: `/admin/users?q=${encodeURIComponent(u.email)}`,
    })),
    workspaces: workspaces.map((w) => ({
      id: w.id,
      primary: w.name,
      secondary: w.account.name,
      tag: "workspace",
      href: `/admin/workspaces/${w.id}`,
    })),
    leads: leads.map((l) => ({
      id: l.id,
      primary: `${l.first_name} ${l.last_name ?? ""}`.trim() || "(no name)",
      secondary: [l.company_name, l.phone, `grade ${l.grade}`, l.account.name].filter(Boolean).join(" · "),
      tag: "lead",
      href: `/admin/leads/${l.id}`,
    })),
    intakeSessions: sessions.map((s) => ({
      id: s.id,
      primary: `${s.rows} rows · ${s.upload_source.replace(/_/g, " ").toLowerCase()}`,
      secondary: `${s.state} · ${s.created_at.toISOString().slice(0, 10)}`,
      tag: "intake",
      href: `/admin/intake/${s.id}`,
    })),
    imports: imports.map((i) => ({
      id: i.id,
      primary: i.file_name ?? "(unnamed import)",
      secondary: `${i.status} · ${i.inserted} of ${i.total_rows} inserted`,
      tag: "import",
      href: `/admin/accounts/${i.account_id}`,
    })),
    total: 0,
  }
  r.total = r.accounts.length + r.users.length + r.workspaces.length + r.leads.length + r.intakeSessions.length + r.imports.length
  return r
}
