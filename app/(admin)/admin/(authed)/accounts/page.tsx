import { listAccounts, type AccountFilters } from "@/lib/admin/accounts"
import { FilterBar, type SelectFilter } from "../_components/FilterBar"
import {
  PageHeader, TableWrap, THead, TBody, Th, Td, Tr, Dot, Pill, EmptyState,
  num, inr, ago, dateOnly, healthTone, RowLink,
} from "../_components/ui"

export const metadata = { title: "Accounts" }

export const dynamic = "force-dynamic"

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined

export default async function AccountsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const f: AccountFilters = {
    q: one(searchParams.q),
    plan: one(searchParams.plan),
    health: one(searchParams.health) as AccountFilters["health"],
    industry: one(searchParams.industry),
    state: one(searchParams.state),
    activation: one(searchParams.activation),
    status: one(searchParams.status),
    joined: one(searchParams.joined),
    sort: (one(searchParams.sort) as AccountFilters["sort"]) ?? "recent",
  }
  const { rows, facets, total } = await listAccounts(f)

  const filters: SelectFilter[] = [
    {
      param: "joined", label: "Joined: any time",
      options: [
        { value: "today", label: "Joined today" },
        { value: "7d", label: "Joined last 7 days" },
        { value: "30d", label: "Joined last 30 days" },
        { value: "90d", label: "Joined last 90 days" },
        { value: "month", label: "Joined this month" },
      ],
    },
    {
      param: "plan", label: "Plan",
      options: [...facets.plans.map((p) => ({ value: p.key, label: p.name })), { value: "none", label: "No subscription" }],
    },
    {
      param: "status", label: "Sub status",
      options: facets.statuses.map((s) => ({ value: s, label: s })),
    },
    {
      param: "health", label: "Health",
      options: [
        { value: "healthy", label: "Healthy" },
        { value: "warning", label: "Needs attention" },
        { value: "critical", label: "At risk" },
      ],
    },
    {
      param: "activation", label: "Activation",
      options: [
        { value: "activated", label: "Activated" },
        { value: "onboarding", label: "Imported, not activated" },
        { value: "never-imported", label: "Never imported" },
      ],
    },
    { param: "industry", label: "Industry", options: facets.industries.map((i) => ({ value: i, label: i })) },
    { param: "state", label: "State", options: facets.states.map((s) => ({ value: s, label: s })) },
    {
      param: "sort", label: "Sort: newest",
      options: [
        { value: "recent", label: "Sort: newest" },
        { value: "active", label: "Sort: last active" },
        { value: "leads", label: "Sort: most leads" },
        { value: "mrr", label: "Sort: highest MRR" },
        { value: "name", label: "Sort: name" },
      ],
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Accounts"
        subtitle="Every customer company. Health is lead volume + how recently anyone logged a signal; the full weighted score lives on each account."
        right={
          <span className="text-[12px] text-ink-muted tabular-nums">
            {rows.length === total ? `${num(total)} accounts` : `${num(rows.length)} of ${num(total)}`}
          </span>
        }
      />

      <FilterBar filters={filters} searchPlaceholder="Search name, industry, city…" />

      <TableWrap>
        <table className="w-full text-left min-w-[1020px]">
          <THead>
            <Th className="w-8"><span className="sr-only">Health</span></Th>
            <Th>Company</Th>
            <Th>Plan</Th>
            <Th className="text-right">MRR</Th>
            <Th className="text-right">Users</Th>
            <Th className="text-right">WS</Th>
            <Th className="text-right">Active leads</Th>
            <Th className="text-right">Conv.</Th>
            <Th className="text-right">Recs used</Th>
            <Th>Activation</Th>
            <Th>Last active</Th>
            <Th>Joined</Th>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <tr><td colSpan={12}><EmptyState>No accounts match these filters.</EmptyState></td></tr>
            ) : rows.map((r) => (
              <Tr key={r.id} href={`/accounts/${r.id}`}>
                <Td><Dot tone={healthTone(r.healthBand)} /></Td>
                <Td>
                  <RowLink href={`/accounts/${r.id}`}>
                    <p className="text-[13px] font-bold text-ink group-hover:text-sky-600 transition-colors">{r.name}</p>
                    <p className="text-[11px] text-ink-muted">
                      {r.industry}
                      {(r.city || r.state) && ` · ${[r.city, r.state].filter(Boolean).join(", ")}`}
                    </p>
                  </RowLink>
                </Td>
                <Td>
                  {r.planName ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-ink font-semibold">{r.planName}</span>
                      {r.subStatus && r.subStatus !== "active" && <Pill tone={r.subStatus === "canceled" ? "red" : "amber"}>{r.subStatus}</Pill>}
                    </span>
                  ) : <span className="text-ink-faint">—</span>}
                </Td>
                <Td className="text-right tabular-nums">{r.mrrInr ? inr(r.mrrInr) : <span className="text-ink-faint">—</span>}</Td>
                <Td className="text-right tabular-nums">{r.users}</Td>
                <Td className="text-right tabular-nums">{r.workspaces}</Td>
                <Td className="text-right tabular-nums">
                  <span className="text-ink font-semibold">{num(r.activeLeads)}</span>
                  {r.leads !== r.activeLeads && <span className="text-ink-faint"> / {num(r.leads)}</span>}
                </Td>
                <Td className="text-right tabular-nums">
                  {r.conversionPct == null ? <span className="text-ink-faint">—</span> : <span className="text-emerald-600 font-semibold">{r.conversionPct}%</span>}
                </Td>
                <Td className="text-right tabular-nums">{num(r.recommendationsUsed)}</Td>
                <Td>
                  {r.activated
                    ? <Pill tone="emerald">activated</Pill>
                    : r.hasImported
                      ? <Pill tone="amber">imported</Pill>
                      : <Pill tone="slate">no import</Pill>}
                </Td>
                <Td className="text-ink-muted whitespace-nowrap">{ago(r.lastActiveAt)}</Td>
                <Td className="text-ink-muted whitespace-nowrap">{dateOnly(r.createdAt)}</Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableWrap>
    </div>
  )
}
