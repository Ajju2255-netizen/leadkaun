import Link from "next/link"
import { listUsers, getUserCounts, type UserFilters } from "@/lib/admin/users"
import { FilterBar, type SelectFilter } from "../_components/FilterBar"
import {
  PageHeader, TableWrap, THead, TBody, Th, Td, Tr, Pill, EmptyState, Stat,
  num, ago, dateOnly,
} from "../_components/ui"
import type { UserRole } from "@prisma/client"

export const metadata = { title: "Users" }

export const dynamic = "force-dynamic"

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined

const FILTERS: SelectFilter[] = [
  {
    param: "role", label: "Role",
    options: [
      { value: "ADMIN", label: "Admin" },
      { value: "MANAGER", label: "Manager" },
      { value: "REP", label: "Rep" },
    ],
  },
  {
    param: "status", label: "Status",
    options: [
      { value: "active", label: "Active" },
      { value: "invited", label: "Invited (never accepted)" },
      { value: "deactivated", label: "Deactivated" },
    ],
  },
  {
    param: "sort", label: "Sort: newest",
    options: [
      { value: "recent", label: "Sort: newest" },
      { value: "active", label: "Sort: last active" },
      { value: "leads", label: "Sort: most leads" },
      { value: "name", label: "Sort: name" },
    ],
  },
]

const STATUS_TONE = { active: "emerald", invited: "amber", deactivated: "slate" } as const

export default async function UsersPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const f: UserFilters = {
    q: one(searchParams.q),
    role: one(searchParams.role) as UserRole | undefined,
    status: one(searchParams.status) as UserFilters["status"],
    accountId: one(searchParams.account),
    sort: (one(searchParams.sort) as UserFilters["sort"]) ?? "recent",
  }
  const [rows, counts] = await Promise.all([listUsers(f), getUserCounts()])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        subtitle="Every user across every tenant. An invited-but-never-accepted user still occupies a seat — that is shown separately from a deactivated one, because only one of the two frees capacity."
        right={<span className="text-[12px] text-ink-muted tabular-nums">{num(rows.length)} shown</span>}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total users" value={num(counts.total)} />
        <Stat label="Active" value={num(counts.active)} tone="emerald" />
        <Stat label="Invited, pending" value={num(counts.invited)} tone={counts.invited > 0 ? "amber" : "slate"} sub="still holds a seat" />
        <Stat label="Deactivated" value={num(counts.deactivated)} sub="seat freed" />
      </div>

      {f.accountId && (
        <p className="text-[12px] text-ink-soft">
          Filtered to one account.{" "}
          <Link href="/users" className="text-sky-600 font-semibold hover:text-sky-700">Show all</Link>
        </p>
      )}

      <FilterBar filters={FILTERS} searchPlaceholder="Search name or email…" />

      <TableWrap>
        <table className="w-full text-left min-w-[980px]">
          <THead>
            <Th>User</Th>
            <Th>Account</Th>
            <Th>Role</Th>
            <Th>Status</Th>
            <Th className="text-right">WS</Th>
            <Th className="text-right">Assigned</Th>
            <Th className="text-right">Signals</Th>
            <Th className="text-right">Recs adopted</Th>
            <Th className="text-right">Won</Th>
            <Th>Last active</Th>
            <Th>Joined</Th>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <tr><td colSpan={11}><EmptyState>No users match these filters.</EmptyState></td></tr>
            ) : rows.map((u) => (
              <Tr key={u.id}>
                <Td>
                  <p className="text-[13px] font-bold text-ink">{u.name}</p>
                  <p className="text-[11px] text-ink-muted">{u.email}</p>
                </Td>
                <Td>
                  <Link href={`/accounts/${u.accountId}`} className="text-sky-600 font-semibold hover:text-sky-700">
                    {u.accountName}
                  </Link>
                </Td>
                <Td><Pill tone={u.role === "ADMIN" ? "sky" : u.role === "MANAGER" ? "violet" : "slate"}>{u.role}</Pill></Td>
                <Td>
                  <Pill tone={STATUS_TONE[u.status]}>{u.status}</Pill>
                  {u.status === "invited" && u.invitedAt && (
                    <span className="text-[10.5px] text-ink-faint ml-1.5">{ago(u.invitedAt)}</span>
                  )}
                </Td>
                <Td className="text-right tabular-nums">{u.workspaces}</Td>
                <Td className="text-right tabular-nums font-semibold text-ink">{num(u.assignedLeads)}</Td>
                <Td className="text-right tabular-nums">{num(u.signals)}</Td>
                <Td className="text-right tabular-nums">{num(u.adoptedRecommendations)}</Td>
                <Td className="text-right tabular-nums text-emerald-600 font-semibold">{num(u.wonLeads)}</Td>
                <Td className="text-ink-muted whitespace-nowrap">{ago(u.lastActiveAt)}</Td>
                <Td className="text-ink-muted whitespace-nowrap">{u.joinedAt ? dateOnly(u.joinedAt) : "—"}</Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableWrap>

      <p className="text-[10.5px] text-ink-faint">
        Capped at the 500 most recent matching users. Signals exclude <code>SOURCE_BASELINE</code> (written by the
        importer, not by a person).
      </p>
    </div>
  )
}
