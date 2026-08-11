import Link from "next/link"
import { listWorkspaces, type WorkspaceFilters } from "@/lib/admin/workspaces"
import { FilterBar, type SelectFilter } from "../_components/FilterBar"
import {
  PageHeader, TableWrap, THead, TBody, Th, Td, Tr, Pill, EmptyState, Stat,
  num, ago, dateOnly,
} from "../_components/ui"

export const dynamic = "force-dynamic"

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined

const FILTERS: SelectFilter[] = [
  {
    param: "state", label: "State",
    options: [
      { value: "active", label: "Active" },
      { value: "archived", label: "Archived" },
      { value: "empty", label: "Empty (no leads)" },
      { value: "idle", label: "Idle (no signal 14d)" },
    ],
  },
  {
    param: "sort", label: "Sort: most leads",
    options: [
      { value: "leads", label: "Sort: most leads" },
      { value: "active", label: "Sort: last active" },
      { value: "recent", label: "Sort: newest" },
      { value: "name", label: "Sort: name" },
    ],
  },
]

export default async function WorkspacesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const f: WorkspaceFilters = {
    q: one(searchParams.q),
    accountId: one(searchParams.account),
    state: one(searchParams.state),
    sort: (one(searchParams.sort) as WorkspaceFilters["sort"]) ?? "leads",
  }
  const rows = await listWorkspaces(f)

  const archived = rows.filter((r) => r.archivedAt != null).length
  const empty = rows.filter((r) => r.leads === 0).length
  const d14 = Date.now() - 14 * 86_400_000
  const idle = rows.filter((r) => r.leads > 0 && (!r.lastActiveAt || r.lastActiveAt.getTime() < d14)).length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Workspaces"
        subtitle="The operational unit — leads, pipeline, sources and membership all live here. ICP and scoring thresholds stay at the account level, shared across every workspace."
        right={<span className="text-[12px] text-ink-muted tabular-nums">{num(rows.length)} workspaces</span>}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total" value={num(rows.length)} />
        <Stat label="Archived" value={num(archived)} tone={archived > 0 ? "amber" : "slate"} />
        <Stat label="Empty" value={num(empty)} tone={empty > 0 ? "amber" : "slate"} sub="never had a lead" />
        <Stat label="Idle" value={num(idle)} tone={idle > 0 ? "red" : "slate"} sub="leads but silent 14d" />
      </div>

      {f.accountId && (
        <p className="text-[12px] text-ink-soft">
          Filtered to one account.{" "}
          <Link href="/admin/workspaces" className="text-sky-600 font-semibold hover:text-sky-700">Show all</Link>
        </p>
      )}

      <FilterBar filters={FILTERS} searchPlaceholder="Search workspace or company…" />

      <TableWrap>
        <table className="w-full text-left min-w-[900px]">
          <THead>
            <Th>Workspace</Th>
            <Th>Account</Th>
            <Th className="text-right">Members</Th>
            <Th className="text-right">Active leads</Th>
            <Th className="text-right">Total</Th>
            <Th className="text-right">Won</Th>
            <Th className="text-right">Intakes</Th>
            <Th>Last activity</Th>
            <Th>Created</Th>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <tr><td colSpan={9}><EmptyState>No workspaces match these filters.</EmptyState></td></tr>
            ) : rows.map((w) => (
              <Tr key={w.id}>
                <Td>
                  <Link href={`/admin/workspaces/${w.id}`} className="block group">
                    <p className="text-[13px] font-bold text-ink group-hover:text-sky-600 transition-colors">
                      {w.name}{" "}
                      {w.isDefault && <Pill tone="sky">default</Pill>}{" "}
                      {w.archivedAt && <Pill tone="amber">archived</Pill>}
                    </p>
                    <p className="text-[11px] text-ink-muted font-mono">{w.slug}</p>
                  </Link>
                </Td>
                <Td>
                  <Link href={`/admin/accounts/${w.accountId}`} className="text-sky-600 font-semibold hover:text-sky-700">
                    {w.accountName}
                  </Link>
                </Td>
                <Td className="text-right tabular-nums">{w.members}</Td>
                <Td className="text-right tabular-nums font-semibold text-ink">{num(w.activeLeads)}</Td>
                <Td className="text-right tabular-nums">{num(w.leads)}</Td>
                <Td className="text-right tabular-nums text-emerald-600 font-semibold">{num(w.won)}</Td>
                <Td className="text-right tabular-nums">{num(w.intakeSessions)}</Td>
                <Td className="text-ink-muted whitespace-nowrap">{ago(w.lastActiveAt)}</Td>
                <Td className="text-ink-muted whitespace-nowrap">{dateOnly(w.createdAt)}</Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableWrap>

      <p className="text-[10.5px] text-ink-faint">
        Members counts <code>workspace_members</code> rows. ADMINs see every workspace in their account without a
        membership row, so an admin-only workspace legitimately shows 0 members.
      </p>
    </div>
  )
}
