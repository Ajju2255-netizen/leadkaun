import Link from "next/link"
import { listLeads, type LeadFilters } from "@/lib/admin/leads"
import { getScopeOptions } from "@/lib/admin/scoring"
import { FilterBar, type SelectFilter } from "../_components/FilterBar"
import {
  PageHeader, TableWrap, THead, TBody, Th, Td, Tr, Grade, Pill, EmptyState,
  num, ago, dateOnly, RowLink,
} from "../_components/ui"
import type { LeadGrade } from "@prisma/client"

export const metadata = { title: "Leads" }

export const dynamic = "force-dynamic"

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined

export default async function LeadsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const f: LeadFilters = {
    q: one(searchParams.q),
    accountId: one(searchParams.account),
    workspaceId: one(searchParams.workspace),
    grade: one(searchParams.grade) as LeadGrade | undefined,
    flag: one(searchParams.flag),
    sort: (one(searchParams.sort) as LeadFilters["sort"]) ?? "recent",
  }
  const [{ rows, truncated }, scope] = await Promise.all([listLeads(f), getScopeOptions()])

  const filters: SelectFilter[] = [
    { param: "account", label: "Account", options: scope.accounts.map((a) => ({ value: a.id, label: a.name })) },
    { param: "grade", label: "Grade", options: ["A", "B", "C", "D", "E", "F"].map((g) => ({ value: g, label: `Grade ${g}` })) },
    {
      param: "flag", label: "Flag",
      options: [
        { value: "open", label: "Open (active)" },
        { value: "sql", label: "SQL" },
        { value: "missed", label: "Missed / at risk" },
        { value: "junk", label: "Junk" },
        { value: "duplicate", label: "Duplicate" },
        { value: "won", label: "Won" },
        { value: "lost", label: "Lost" },
      ],
    },
    {
      param: "sort", label: "Sort: newest",
      options: [
        { value: "recent", label: "Sort: newest" },
        { value: "score", label: "Sort: queue score" },
        { value: "grade", label: "Sort: grade" },
        { value: "value", label: "Sort: deal value" },
      ],
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leads"
        subtitle="Cross-tenant lead search — by name, phone, email or company. Open any lead for the full intelligence inspector: score breakdown, evidence timeline, recommendation history, and a live re-computation of what the engine would grade it today."
        right={<span className="text-[12px] text-ink-muted tabular-nums">{num(rows.length)}{truncated ? "+" : ""} leads</span>}
      />

      <FilterBar filters={filters} searchPlaceholder="Name, phone, email, company…" />

      {!f.q && !f.accountId && !f.grade && !f.flag && (
        <p className="text-[12px] text-ink-muted">
          Showing the most recently imported leads across every tenant. Search or filter to narrow.
        </p>
      )}

      <TableWrap>
        <table className="w-full text-left min-w-[1000px]">
          <THead>
            <Th className="w-8">G</Th>
            <Th>Lead</Th>
            <Th>Account</Th>
            <Th className="text-right">Fit</Th>
            <Th className="text-right">Intent</Th>
            <Th className="text-right">Quality</Th>
            <Th className="text-right">Queue score</Th>
            <Th>Flags</Th>
            <Th>Source</Th>
            <Th>Rep</Th>
            <Th>Last action</Th>
            <Th>Imported</Th>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <tr><td colSpan={12}><EmptyState>No leads match. Try a phone number or company name.</EmptyState></td></tr>
            ) : rows.map((l) => (
              <Tr key={l.id} href={`/leads/${l.id}`}>
                <Td><Grade grade={l.grade} /></Td>
                <Td>
                  <RowLink href={`/leads/${l.id}`}>
                    <p className="text-[13px] font-bold text-ink group-hover:text-sky-600 transition-colors">{l.name || "(no name)"}</p>
                    <p className="text-[11px] text-ink-muted">
                      {[l.company, l.phone].filter(Boolean).join(" · ")}
                    </p>
                  </RowLink>
                </Td>
                <Td>
                  <Link href={`/accounts/${l.accountId}`} className="text-sky-600 font-semibold hover:text-sky-700">
                    {l.accountName}
                  </Link>
                </Td>
                <Td className="text-right tabular-nums">{l.fit}</Td>
                <Td className="text-right tabular-nums">{l.intent}</Td>
                <Td className="text-right tabular-nums">{l.quality}</Td>
                <Td className="text-right tabular-nums font-bold text-ink">{l.aiScore}</Td>
                <Td>
                  <span className="flex items-center gap-1 flex-wrap">
                    {l.isSql && <Pill tone="emerald">SQL</Pill>}
                    {l.isMissed && <Pill tone="red">missed</Pill>}
                    {l.isJunk && <Pill tone="slate">junk</Pill>}
                    {l.isDuplicate && <Pill tone="amber">dupe</Pill>}
                    {l.wonAt && <Pill tone="emerald">won</Pill>}
                    {l.lostAt && <Pill tone="slate">lost</Pill>}
                  </span>
                </Td>
                <Td className="text-ink-muted">{l.sourceName}</Td>
                <Td className="text-ink-muted">{l.repName ?? <span className="text-ink-faint">unassigned</span>}</Td>
                <Td className="text-ink-muted whitespace-nowrap">{l.lastActionAt ? ago(l.lastActionAt) : <span className="text-ink-faint">never</span>}</Td>
                <Td className="text-ink-muted whitespace-nowrap">{dateOnly(l.importedAt)}</Td>
              </Tr>
            ))}
          </TBody>
        </table>
      </TableWrap>

      {truncated && (
        <p className="text-[11px] text-ink-faint">
          Result set truncated at 100 rows — narrow the filters rather than paging, so the query stays cheap.
        </p>
      )}
      <p className="text-[10.5px] text-ink-faint">
        Queue score is the blended ranking the Priority Queue sorts by (intent 0.50 · fit 0.30 · quality 0.20). It is
        deliberately different from the grade, which is a threshold matrix over all three.
      </p>
    </div>
  )
}
