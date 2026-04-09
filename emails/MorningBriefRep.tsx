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

export interface TopLead {
  id: string
  first_name: string
  last_name: string | null
  company_name: string | null
  grade: string
  nba: string
  expected_value: number | null
}

export interface MorningBriefRepProps {
  rep_first_name: string
  top_leads: TopLead[]
  callbacks_due: number
  re_engagements: number
  follow_ups_due: number
  completed_this_week: number
  win_highlight: { lead_name: string; value: number } | null
  queue_url: string
}

const GRADE_COLORS: Record<string, string> = {
  A: "#16a34a", B: "#2563eb", C: "#ca8a04",
  D: "#ea580c", E: "#dc2626", F: "#6b7280",
}

function formatRupee(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n}`
}

export function MorningBriefRep({
  rep_first_name,
  top_leads,
  callbacks_due,
  re_engagements,
  follow_ups_due,
  completed_this_week,
  win_highlight,
  queue_url,
}: MorningBriefRepProps) {
  const preview = `Good morning ${rep_first_name} — ${callbacks_due} callbacks due today, ${follow_ups_due} follow-ups pending`

  return (
    <BaseEmail preview={preview}>
      {/* Greeting */}
      <Heading style={styles.h1}>Good morning, {rep_first_name} 👋</Heading>
      <Text style={styles.subheading}>Here&apos;s your sales brief for today.</Text>

      {/* Today's stats */}
      <Section style={styles.statsRow}>
        <Row>
          <Column style={styles.statCell}>
            <Text style={styles.statNumber}>{callbacks_due}</Text>
            <Text style={styles.statLabel}>Callbacks due</Text>
          </Column>
          <Column style={styles.statCell}>
            <Text style={styles.statNumber}>{follow_ups_due}</Text>
            <Text style={styles.statLabel}>Follow-ups due</Text>
          </Column>
          <Column style={styles.statCell}>
            <Text style={styles.statNumber}>{re_engagements}</Text>
            <Text style={styles.statLabel}>Re-engagements</Text>
          </Column>
          <Column style={styles.statCell}>
            <Text style={styles.statNumber}>{completed_this_week}</Text>
            <Text style={styles.statLabel}>Done this week</Text>
          </Column>
        </Row>
      </Section>

      {/* Top 3 leads */}
      {top_leads.length > 0 && (
        <>
          <Hr style={styles.hr} />
          <Heading style={styles.h2}>Your top priorities today</Heading>
          {top_leads.slice(0, 3).map((lead) => (
            <Section key={lead.id} style={styles.leadCard}>
              <Row>
                <Column style={{ width: "32px" }}>
                  <Text style={{ ...styles.gradeBadge, backgroundColor: GRADE_COLORS[lead.grade] ?? "#6b7280" }}>
                    {lead.grade}
                  </Text>
                </Column>
                <Column>
                  <Text style={styles.leadName}>
                    {lead.first_name} {lead.last_name ?? ""}
                    {lead.company_name ? ` · ${lead.company_name}` : ""}
                    {lead.expected_value ? ` · ${formatRupee(lead.expected_value)}` : ""}
                  </Text>
                  <Text style={styles.leadNba}>{lead.nba}</Text>
                </Column>
              </Row>
            </Section>
          ))}
        </>
      )}

      {/* Win highlight */}
      {win_highlight && (
        <>
          <Hr style={styles.hr} />
          <Section style={styles.winHighlight}>
            <Text style={styles.winText}>
              🏆 You closed <strong>{win_highlight.lead_name}</strong> for{" "}
              <strong>{formatRupee(win_highlight.value)}</strong> this week. Great work!
            </Text>
          </Section>
        </>
      )}

      {/* CTA */}
      <Hr style={styles.hr} />
      <Section style={{ textAlign: "center", padding: "24px 0 8px" }}>
        <Button href={queue_url} style={styles.ctaButton}>
          Open My Queue
        </Button>
      </Section>
    </BaseEmail>
  )
}

export default MorningBriefRep

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
    fontSize: "28px",
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
  leadCard: {
    borderLeft: "3px solid #e4e4e7",
    paddingLeft: "12px",
    marginBottom: "12px",
  },
  gradeBadge: {
    color: "#ffffff",
    fontSize: "12px",
    fontWeight: "700",
    width: "24px",
    height: "24px",
    borderRadius: "4px",
    textAlign: "center" as const,
    lineHeight: "24px",
    margin: "0",
  },
  leadName: {
    color: "#09090b",
    fontSize: "14px",
    fontWeight: "600",
    margin: "0 0 2px",
    lineHeight: "1.3",
  },
  leadNba: {
    color: "#52525b",
    fontSize: "13px",
    margin: "0",
  },
  winHighlight: {
    backgroundColor: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: "8px",
    padding: "12px 16px",
  },
  winText: {
    color: "#166534",
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
