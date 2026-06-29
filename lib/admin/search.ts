// Cross-account search for Mission Control Support (admin-only). Matches
// companies, users, leads and workspaces; every result links to a Company 360.

import { prisma } from "@/lib/prisma"

export type SearchResults = {
  accounts: { id: string; name: string; industry: string }[]
  users: { accountId: string; name: string; email: string; role: string }[]
  leads: { id: string; accountId: string; name: string; company: string | null; phone: string }[]
  workspaces: { accountId: string; name: string }[]
}

const EMPTY: SearchResults = { accounts: [], users: [], leads: [], workspaces: [] }

export async function platformSearch(q: string): Promise<SearchResults> {
  const term = q.trim()
  if (term.length < 2) return EMPTY
  const like = { contains: term, mode: "insensitive" as const }

  const [accounts, users, leads, workspaces] = await Promise.all([
    prisma.account.findMany({ where: { name: like }, take: 8, select: { id: true, name: true, industry: true }, orderBy: { created_at: "desc" } }),
    prisma.user.findMany({ where: { OR: [{ email: like }, { first_name: like }, { last_name: like }] }, take: 8, select: { account_id: true, first_name: true, last_name: true, email: true, role: true } }),
    prisma.lead.findMany({ where: { OR: [{ first_name: like }, { last_name: like }, { company_name: like }, { phone: { contains: term } }, { email: like }] }, take: 10, select: { id: true, account_id: true, first_name: true, last_name: true, company_name: true, phone: true } }),
    prisma.workspace.findMany({ where: { name: like }, take: 6, select: { account_id: true, name: true } }),
  ])

  return {
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, industry: a.industry })),
    users: users.map((u) => ({ accountId: u.account_id, name: `${u.first_name} ${u.last_name ?? ""}`.trim(), email: u.email, role: u.role })),
    leads: leads.map((l) => ({ id: l.id, accountId: l.account_id, name: `${l.first_name} ${l.last_name ?? ""}`.trim(), company: l.company_name, phone: l.phone })),
    workspaces: workspaces.map((w) => ({ accountId: w.account_id, name: w.name })),
  }
}
