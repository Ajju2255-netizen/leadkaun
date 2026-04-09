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

export interface GradeDropProps {
  recipient_name: string
  lead_first_name: string
  lead_last_name: string | null
  lead_company: string | null
  grade_from: string
  grade_to: string
  expected_value: number | null
  days_since_contact: number
  reason: string
  lead_url: string
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

export function GradeDrop({
  recipient_name,
  lead_first_name,
  lead_last_name,
  lead_company,
  grade_from,
  grade_to,
  expected_value,
  days_since_contact,
  reason,
  lead_url,
}: GradeDropProps) {
  const leadName = `${lead_first_name} ${lead_last_name ?? ""}`.trim()
  const preview = `Grade drop alert: ${leadName} dropped from ${grade_from} to ${grade_to}`

  return (
    <BaseEmail preview={preview}>
      {/* Alert badge */}
      <Section style={styles.alertBadge}>
        <Text style={styles.alertBadgeText}>GRADE DROP ALERT</Text>
      </Section>

      <Heading style={styles.h1}>Lead Grade Dropped</Heading>
      <Text style={styles.subheading}>
        Hi {recipient_name}, a lead you&apos;re tracking has dropped in grade.
      </Text>

      {/* Grade change visual */}
      <Section style={styles.gradeChangeCard}>
        <Text style={styles.leadName}>{leadName}</Text>
        {lead_company && <Text style={styles.leadCompany}>{lead_company}</Text>}

        <Hr style={styles.innerHr} />

        <Row>
          <Column style={{ textAlign: "center" as const }}>
            <Text style={styles.gradeLabel}>Was</Text>
            <Text style={{ ...styles.gradeValue, color: GRADE_COLORS[grade_from] ?? "#6b7280" }}>
              {grade_from}
            </Text>
          </Column>
          <Column style={{ textAlign: "center" as const, width: "40px" }}>
            <Text style={styles.arrow}>→</Text>
          </Column>
          <Column style={{ textAlign: "center" as const }}>
            <Text style={styles.gradeLabel}>Now</Text>
            <Text style={{ ...styles.gradeValue, color: GRADE_COLORS[grade_to] ?? "#6b7280" }}>
              {grade_to}
            </Text>
          </Column>
        </Row>

        <Hr style={styles.innerHr} />

        <Row>
          {expected_value != null && (
            <Column style={styles.metaCell}>
              <Text style={styles.metaNumber}>{formatRupee(expected_value)}</Text>
              <Text style={styles.metaLabel}>Deal value</Text>
            </Column>
          )}
          <Column style={styles.metaCell}>
            <Text style={{ ...styles.metaNumber, color: days_since_contact > 7 ? "#dc2626" : "#09090b" }}>
              {days_since_contact}d
            </Text>
            <Text style={styles.metaLabel}>Since last contact</Text>
          </Column>
        </Row>

        <Hr style={styles.innerHr} />
        <Text style={styles.reasonLabel}>Why it dropped</Text>
        <Text style={styles.reasonText}>{reason}</Text>
      </Section>

      {/* CTA */}
      <Section style={{ textAlign: "center", padding: "24px 0 8px" }}>
        <Button href={lead_url} style={styles.ctaButton}>
          Re-engage Now
        </Button>
      </Section>
    </BaseEmail>
  )
}

export default GradeDrop

const styles = {
  alertBadge: {
    backgroundColor: "#fef2f2",
    borderRadius: "4px",
    padding: "6px 12px",
    display: "inline-block",
    marginBottom: "16px",
  },
  alertBadgeText: {
    color: "#991b1b",
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
  gradeChangeCard: {
    border: "1px solid #e4e4e7",
    borderRadius: "8px",
    padding: "20px 24px",
    marginBottom: "8px",
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
  gradeLabel: {
    color: "#71717a",
    fontSize: "11px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    margin: "0 0 4px",
  },
  gradeValue: {
    fontSize: "48px",
    fontWeight: "800",
    margin: "0",
    lineHeight: "1",
  },
  arrow: {
    color: "#71717a",
    fontSize: "24px",
    margin: "24px 0 0",
  },
  metaCell: {
    textAlign: "center" as const,
    padding: "0 16px",
  },
  metaNumber: {
    color: "#09090b",
    fontSize: "24px",
    fontWeight: "700",
    margin: "0",
    lineHeight: "1",
  },
  metaLabel: {
    color: "#71717a",
    fontSize: "11px",
    margin: "4px 0 0",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  reasonLabel: {
    color: "#71717a",
    fontSize: "11px",
    fontWeight: "600",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    margin: "0 0 4px",
  },
  reasonText: {
    color: "#09090b",
    fontSize: "14px",
    margin: "0",
    lineHeight: "1.5",
  },
  ctaButton: {
    backgroundColor: "#dc2626",
    borderRadius: "6px",
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: "600",
    padding: "12px 32px",
    textDecoration: "none",
    display: "inline-block",
  },
}
