import Link from "next/link"
import { Check, X, Minus } from "lucide-react"
import { getFlagMatrix } from "@/lib/admin/audit"
import { FEATURE_KEYS, FEATURE_LABELS } from "@/lib/feature-flags"
import {
  PageHeader, Card, Stat, SectionLabel, EmptyState,
  TableWrap, THead, TBody, Th, Td, Tr, num, ago,
} from "../../_components/ui"

export const dynamic = "force-dynamic"

/** ON (explicit) · OFF (explicit) · default (no row → treated as ON). */
function FlagCell({ value }: { value: boolean | undefined }) {
  if (value === undefined) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-ink-faint" title="No row — defaults to ON">
        <Minus className="w-3 h-3" strokeWidth={3} /> default
      </span>
    )
  }
  return value ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
      <Check className="w-3 h-3" strokeWidth={3.5} /> on
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600">
      <X className="w-3 h-3" strokeWidth={3.5} /> off
    </span>
  )
}

export default async function FlagsPage() {
  const { rows, overriddenAccounts } = await getFlagMatrix()
  const offCounts = FEATURE_KEYS.map((k) => ({
    key: k,
    label: FEATURE_LABELS[k],
    off: rows.filter((r) => r.flags[k] === false).length,
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feature flags"
        subtitle="Per-account toggles. A missing row means the default, which is ON — reads fail open, so a database hiccup can never hide a feature from a paying customer."
        right={<span className="text-[12px] text-ink-muted tabular-nums">{num(overriddenAccounts)} of {num(rows.length)} overridden</span>}
      />

      <div className="rounded-2xl border border-orange-200 bg-orange-50/70 px-5 py-3.5">
        <p className="text-[12.5px] font-bold text-orange-800">These flags do not gate anything yet.</p>
        <p className="text-[11.5px] text-orange-700 mt-0.5 leading-relaxed">
          <code>isFeatureEnabled()</code> is implemented and these values are written and audited, but no product
          surface calls it. Turning a flag off today changes what this panel reports, not what the customer sees.
          Percentage rollouts and environment targeting also do not exist — the model is a per-account boolean.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {offCounts.map((f) => (
          <Stat key={f.key} label={f.label} value={f.off === 0 ? "all on" : `${f.off} off`} tone={f.off > 0 ? "amber" : "emerald"} />
        ))}
      </div>

      <section>
        <SectionLabel right="toggle from each Account 360">Matrix</SectionLabel>
        <TableWrap>
          <table className="w-full text-left min-w-[820px]">
            <THead>
              <Th>Account</Th>
              {FEATURE_KEYS.map((k) => <Th key={k}>{FEATURE_LABELS[k]}</Th>)}
              <Th>Last changed</Th>
              <Th>By</Th>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <tr><td colSpan={FEATURE_KEYS.length + 3}><EmptyState>No accounts.</EmptyState></td></tr>
              ) : rows.map((r) => (
                <Tr key={r.accountId}>
                  <Td>
                    <Link href={`/admin/accounts/${r.accountId}`} className="text-[13px] font-bold text-ink hover:text-sky-600">
                      {r.accountName}
                    </Link>
                  </Td>
                  {FEATURE_KEYS.map((k) => <Td key={k}><FlagCell value={r.flags[k]} /></Td>)}
                  <Td className="text-ink-muted whitespace-nowrap">{r.lastChangedAt ? ago(r.lastChangedAt) : "—"}</Td>
                  <Td className="text-ink-muted text-[11px]">{r.lastChangedBy ?? "—"}</Td>
                </Tr>
              ))}
            </TBody>
          </table>
        </TableWrap>
      </section>

      <Card>
        <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1.5">Experiments</p>
        <p className="text-[12px] text-ink-soft leading-relaxed">
          There is no experiment framework in this codebase — no assignment table, no variant column, no exposure
          logging. A/B tests on the recommendation explanation or the intake report would need all three before any
          result could be trusted, so no experiments screen is shown rather than one that reports nothing. The
          telemetry to measure them already exists: <code>recommendation_events</code> for expand/accept/execute and{" "}
          <code>intake_sessions</code> for Time-to-Trust and approval rate.
        </p>
      </Card>
    </div>
  )
}
