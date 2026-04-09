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

export interface SqlAlertProps {
  recipient_name: string
  lead_first_name: string
  lead_last_name: string | null
  lead_company: string | null
  grade: string
  fit_score: number
  intent_score: number
  nba: string
  lead_url: string
}

const GRADE_COLORS: Record<string, string> = {
  A: "#16a34a", B: "#2563eb", C: "#ca8a04",
  D: "#ea580c", E: "#dc2626", F: "#6b7280",
}

export function SqlAlert({
  recipient_name,
  lead_first_name,
  lead_last_name,
  lead_company,
  grade,
  fit_score,
  intent_score,
  nba,
  lead_url,
}: SqlAlertProps) {
  const leadName = `${lead_first_name} ${lead_last_name ?? ""}`.trim()
  const preview = `SQL Alert: ${leadName}${lead_company ? ` · ${lead_company}` : ""} has crossed the SQL threshold`

  return (
    <BaseEmail preview={preview}>
      {/* Alert badge */}
      <Section style={styles.alertBadge}>
        <Text style={styles.alertBadgeText}>SQL THRESHOLD CROSSED</Text>
      </Section>

      <Heading style={styles.h1}>New Sales Qualified Lead</Heading>
      <Text style={styles.subheading}>Hi {recipient_name}, a lead just crossed your SQL threshold.</Text>

      {/* Lead card */}
      <Section style={styles.leadCard}>
        <Row>
          <Column>
            <Text style={{ ...styles.gradeBadge, backgroundColor: GRADE_COLORS[grade] ?? "#6b7280" }}>
              Grade {grade}
            </Text>
          </Column>
        </Row>
        <Text style={styles.leadName}>{leadName}</Text>
        {lead_company && <Text style={styles.leadCompany}>{lead_company}</Text>}
        <Hr style={styles.innerHr} />
        <Row>
          <Column style={styles.scoreCell}>
            <Text style={styles.scoreNumber}>{fit_score}</Text>
            <Text style={styles.scoreLabel}>Fit Score</Text>
          </Column>
          <Column style={styles.scoreCell}>
            <Text style={styles.scoreNumber}>{intent_score}</Text>
            <Text style={styles.scoreLabel}>Intent Score</Text>
          </Column>
        </Row>
        <Hr style={styles.innerHr} />
        <Text style={styles.nbaLabel}>Next Best Action</Text>
        <Text style={styles.nbaText}>{nba}</Text>
      </Section>

      {/* CTA */}
      <Section style={{ textAlign: "center", padding: "24px 0 8px" }}>
        <Button href={lead_url} style={styles.ctaButton}>
          View Lead Record
        </Button>
      </Section>
    </BaseEmail>
  )
}

export default SqlAlert

const styles = {
  alertBadge: {
    backgroundColor: "#dcfce7",
    borderRadius: "4px",
    padding: "6px 12px",
    display: "inline-block",
    marginBottom: "16px",
  },
  alertBadgeText: {
    color: "#166534",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.08em",
    margin: "0",
    textTransform: "uppercase" as const,
  },
  h1: {
    color: "#09090b",
    fontSize: "24px",
    fontWeight: "700",
    margin: "0 0 4px",
    lineHeight: "1.3",
  },
  subheading: {
    color: "#52525b",
    fontSize: "15px",
    margin: "0 0 24px",
  },
  leadCard: {
    border: "1px solid #e4e4e7",
    borderRadius: "8px",
    padding: "20px 24px",
    marginBottom: "8px",
  },
  gradeBadge: {
    color: "#ffffff",
    fontSize: "12px",
    fontWeight: "700",
    padding: "3px 10px",
    borderRadius: "4px",
    display: "inline-block",
    margin: "0 0 12px",
  },
  leadName: {
    color: "#09090b",
    fontSize: "20px",
    fontWeight: "700",
    margin: "0 0 2px",
  },
  leadCompany: {
    color: "#52525b",
    fontSize: "14px",
    margin: "0",
  },
  innerHr: {
    borderColor: "#e4e4e7",
    margin: "16px 0",
  },
  scoreCell: {
    textAlign: "center" as const,
    padding: "0 16px",
  },
  scoreNumber: {
    color: "#09090b",
    fontSize: "32px",
    fontWeight: "700",
    margin: "0",
    lineHeight: "1",
  },
  scoreLabel: {
    color: "#71717a",
    fontSize: "11px",
    margin: "4px 0 0",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  nbaLabel: {
    color: "#71717a",
    fontSize: "11px",
    fontWeight: "600",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    margin: "0 0 4px",
  },
  nbaText: {
    color: "#09090b",
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
