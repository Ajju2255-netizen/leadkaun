import {
  Button,
  Heading,
  Section,
  Text,
  Hr,
  Row,
  Column,
} from "@react-email/components"
import * as React from "react"
import { BaseEmail } from "./layout/BaseEmail"

export interface RepStat {
  first_name: string
  last_name: string
  assigned: number
  follow_up_pct: number
  speed_to_lead_hours: number | null
  missed_value: number
}

export interface UncalledALead {
  first_name: string
  last_name: string | null
  company_name: string | null
  rep_name: string
  hours_since_assign: number
}

export interface MorningBriefManagerProps {
  manager_first_name: string
  pipeline_value: number
  total_active_leads: number
  team_followup_pct: number
  uncalled_a_grade: UncalledALead[]
  missed_followups_count: number
  rep_stats: RepStat[]
  rep_spotlight: RepStat | null
  dashboard_url: string
}

function formatRupee(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n}`
}

function fupPctColor(pct: number): string {
  if (pct >= 80) return "#16a34a"
  if (pct >= 60) return "#ca8a04"
  return "#dc2626"
}

export function MorningBriefManager({
  manager_first_name,
  pipeline_value,
  total_active_leads,
  team_followup_pct,
  uncalled_a_grade,
  missed_followups_count,
  rep_stats,
  rep_spotlight,
  dashboard_url,
}: MorningBriefManagerProps) {
  const preview = `Pipeline: ${formatRupee(pipeline_value)} · ${uncalled_a_grade.length} uncalled A-grade leads · Team FU% ${team_followup_pct}%`

  return (
    <BaseEmail preview={preview}>
      {/* Greeting */}
      <Heading style={styles.h1}>Morning brief, {manager_first_name}</Heading>
      <Text style={styles.subheading}>
        Your team&apos;s performance snapshot for today.
      </Text>

      {/* Pipeline summary */}
      <Section style={styles.statsRow}>
        <Row>
          <Column style={styles.statCell}>
            <Text style={styles.statNumber}>{formatRupee(pipeline_value)}</Text>
            <Text style={styles.statLabel}>Pipeline value</Text>
          </Column>
          <Column style={styles.statCell}>
            <Text style={styles.statNumber}>{total_active_leads}</Text>
            <Text style={styles.statLabel}>Active leads</Text>
          </Column>
          <Column style={styles.statCell}>
            <Text style={{ ...styles.statNumber, color: fupPctColor(team_followup_pct) }}>
              {team_followup_pct}%
            </Text>
            <Text style={styles.statLabel}>Team FU%</Text>
          </Column>
          <Column style={styles.statCell}>
            <Text style={{ ...styles.statNumber, color: missed_followups_count > 0 ? "#dc2626" : "#09090b" }}>
              {missed_followups_count}
            </Text>
            <Text style={styles.statLabel}>Missed FU</Text>
          </Column>
        </Row>
      </Section>

      {/* Uncalled A-grade */}
      {uncalled_a_grade.length > 0 && (
        <>
          <Hr style={styles.hr} />
          <Heading style={styles.h2}>
            ⚠️ {uncalled_a_grade.length} A-grade lead{uncalled_a_grade.length > 1 ? "s" : ""} not contacted
          </Heading>
          {uncalled_a_grade.slice(0, 5).map((lead, i) => (
            <Section key={i} style={styles.alertRow}>
              <Text style={styles.alertText}>
                <strong>{lead.first_name} {lead.last_name ?? ""}</strong>
                {lead.company_name ? ` · ${lead.company_name}` : ""}
                {" "}— assigned to <strong>{lead.rep_name}</strong>,{" "}
                {Math.round(lead.hours_since_assign)}h ago
              </Text>
            </Section>
          ))}
          {uncalled_a_grade.length > 5 && (
            <Text style={styles.moreText}>+ {uncalled_a_grade.length - 5} more in dashboard</Text>
          )}
        </>
      )}

      {/* Rep performance table */}
      {rep_stats.length > 0 && (
        <>
          <Hr style={styles.hr} />
          <Heading style={styles.h2}>Team Performance</Heading>
          <Section style={styles.tableWrapper}>
            <Row style={styles.tableHeader}>
              <Column style={{ ...styles.tableCell, width: "160px" }}>
                <Text style={styles.tableHeaderText}>Rep</Text>
              </Column>
              <Column style={styles.tableCell}>
                <Text style={styles.tableHeaderText}>Leads</Text>
              </Column>
              <Column style={styles.tableCell}>
                <Text style={styles.tableHeaderText}>FU%</Text>
              </Column>
              <Column style={styles.tableCell}>
                <Text style={styles.tableHeaderText}>Speed</Text>
              </Column>
              <Column style={styles.tableCell}>
                <Text style={styles.tableHeaderText}>Missed ₹</Text>
              </Column>
            </Row>
            {rep_stats.map((rep, i) => (
              <Row key={i} style={i % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd}>
                <Column style={{ ...styles.tableCell, width: "160px" }}>
                  <Text style={styles.tableCellText}>
                    {rep.first_name} {rep.last_name}
                  </Text>
                </Column>
                <Column style={styles.tableCell}>
                  <Text style={styles.tableCellText}>{rep.assigned}</Text>
                </Column>
                <Column style={styles.tableCell}>
                  <Text style={{ ...styles.tableCellText, color: fupPctColor(rep.follow_up_pct), fontWeight: "600" }}>
                    {rep.follow_up_pct}%
                  </Text>
                </Column>
                <Column style={styles.tableCell}>
                  <Text style={styles.tableCellText}>
                    {rep.speed_to_lead_hours != null ? `${rep.speed_to_lead_hours.toFixed(1)}h` : "—"}
                  </Text>
                </Column>
                <Column style={styles.tableCell}>
                  <Text style={{ ...styles.tableCellText, color: rep.missed_value > 0 ? "#dc2626" : "#09090b" }}>
                    {rep.missed_value > 0 ? formatRupee(rep.missed_value) : "—"}
                  </Text>
                </Column>
              </Row>
            ))}
          </Section>
        </>
      )}

      {/* Rep spotlight */}
      {rep_spotlight && (
        <>
          <Hr style={styles.hr} />
          <Section style={styles.spotlight}>
            <Text style={styles.spotlightText}>
              ⭐ <strong>Rep spotlight:</strong> {rep_spotlight.first_name} {rep_spotlight.last_name} is leading
              with <strong>{rep_spotlight.follow_up_pct}% FU%</strong> and{" "}
              {rep_spotlight.speed_to_lead_hours != null
                ? `${rep_spotlight.speed_to_lead_hours.toFixed(1)}h avg speed-to-lead`
                : "strong engagement"}
              .
            </Text>
          </Section>
        </>
      )}

      {/* CTA */}
      <Hr style={styles.hr} />
      <Section style={{ textAlign: "center", padding: "24px 0 8px" }}>
        <Button href={dashboard_url} style={styles.ctaButton}>
          Open Dashboard
        </Button>
      </Section>
    </BaseEmail>
  )
}

export default MorningBriefManager

const styles = {
  h1: {
    color: "#09090b",
    fontSize: "24px",
    fontWeight: "700",
    margin: "0 0 4px",
    lineHeight: "1.3",
  },
  h2: {
    color: "#09090b",
    fontSize: "16px",
    fontWeight: "600",
    margin: "20px 0 12px",
  },
  subheading: {
    color: "#52525b",
    fontSize: "15px",
    margin: "0 0 24px",
  },
  statsRow: {
    backgroundColor: "#f4f4f5",
    borderRadius: "8px",
    padding: "16px",
  },
  statCell: {
    textAlign: "center" as const,
    padding: "0 8px",
  },
  statNumber: {
    color: "#09090b",
    fontSize: "24px",
    fontWeight: "700",
    margin: "0",
    lineHeight: "1",
  },
  statLabel: {
    color: "#71717a",
    fontSize: "11px",
    margin: "4px 0 0",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  hr: {
    borderColor: "#e4e4e7",
    margin: "20px 0",
  },
  alertRow: {
    borderLeft: "3px solid #fca5a5",
    paddingLeft: "12px",
    marginBottom: "8px",
  },
  alertText: {
    color: "#09090b",
    fontSize: "13px",
    margin: "0",
    lineHeight: "1.5",
  },
  moreText: {
    color: "#71717a",
    fontSize: "12px",
    margin: "4px 0 0",
  },
  tableWrapper: {
    border: "1px solid #e4e4e7",
    borderRadius: "6px",
    overflow: "hidden",
  },
  tableHeader: {
    backgroundColor: "#f4f4f5",
  },
  tableHeaderText: {
    color: "#71717a",
    fontSize: "11px",
    fontWeight: "600",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    margin: "0",
  },
  tableCell: {
    padding: "8px 12px",
  },
  tableCellText: {
    color: "#09090b",
    fontSize: "13px",
    margin: "0",
  },
  tableRowEven: {
    backgroundColor: "#ffffff",
  },
  tableRowOdd: {
    backgroundColor: "#fafafa",
  },
  spotlight: {
    backgroundColor: "#fefce8",
    border: "1px solid #fef08a",
    borderRadius: "8px",
    padding: "12px 16px",
  },
  spotlightText: {
    color: "#713f12",
    fontSize: "14px",
    margin: "0",
    lineHeight: "1.5",
  },
  ctaButton: {
    backgroundColor: "#09090b",
    borderRadius: "6px",
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: "600",
    padding: "12px 32px",
    textDecoration: "none",
    display: "inline-block",
  },
}
