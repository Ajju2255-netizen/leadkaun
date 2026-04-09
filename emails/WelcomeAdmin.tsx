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

export interface WelcomeAdminProps {
  admin_first_name: string
  org_name: string
  dashboard_url: string
}

const responsibilities = [
  {
    icon: "👥",
    title: "Manage your team",
    body: "Invite reps and managers. Deactivate and reassign leads when someone leaves.",
  },
  {
    icon: "🎯",
    title: "Configure your ICP",
    body: "Define your Ideal Customer Profile. Changing ICP will regrade all active leads automatically.",
  },
  {
    icon: "📊",
    title: "Monitor performance",
    body: "Watch the Analytics dashboard. Uncalled A-grade leads are a revenue risk — act fast.",
  },
  {
    icon: "⚙️",
    title: "Set follow-up rules",
    body: "Configure follow-up schedules per grade. These drive your team's daily priority queue.",
  },
  {
    icon: "🔒",
    title: "Data ownership",
    body: "You are responsible for your account's data. Each rep can only see their own assigned leads.",
  },
  {
    icon: "📋",
    title: "Admin responsibility",
    body: "As admin, you have full access to all leads, settings, and team management. Use it carefully.",
  },
]

export function WelcomeAdmin({
  admin_first_name,
  org_name,
  dashboard_url,
}: WelcomeAdminProps) {
  const preview = `Welcome to Leadkaun, ${admin_first_name} — your Sales Behaviour OS is ready`

  return (
    <BaseEmail preview={preview}>
      {/* Header */}
      <Heading style={styles.h1}>Welcome to Leadkaun, {admin_first_name}!</Heading>
      <Text style={styles.subheading}>
        Your account for <strong>{org_name}</strong> is set up. You have been assigned the{" "}
        <strong>Admin</strong> role with full access.
      </Text>

      {/* Responsibility statement */}
      <Section style={styles.responsibilityBox}>
        <Text style={styles.responsibilityTitle}>As Admin, you are responsible for:</Text>
        {responsibilities.map((r, i) => (
          <Row key={i} style={{ marginBottom: "12px" }}>
            <Column style={{ width: "32px", verticalAlign: "top" }}>
              <Text style={styles.icon}>{r.icon}</Text>
            </Column>
            <Column>
              <Text style={styles.respItemTitle}>{r.title}</Text>
              <Text style={styles.respItemBody}>{r.body}</Text>
            </Column>
          </Row>
        ))}
      </Section>

      <Hr style={styles.hr} />

      {/* Getting started */}
      <Heading style={styles.h2}>Get started in 3 steps</Heading>

      <Row style={{ marginBottom: "12px" }}>
        <Column style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></Column>
        <Column>
          <Text style={styles.stepTitle}>Set up your ICP</Text>
          <Text style={styles.stepBody}>Go to Settings → ICP to define your target industries, states, and budget range. This powers lead grading.</Text>
        </Column>
      </Row>

      <Row style={{ marginBottom: "12px" }}>
        <Column style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></Column>
        <Column>
          <Text style={styles.stepTitle}>Import your first leads</Text>
          <Text style={styles.stepBody}>Upload a CSV or connect a Google Sheet. Leads are scored and graded automatically within 60 seconds.</Text>
        </Column>
      </Row>

      <Row style={{ marginBottom: "12px" }}>
        <Column style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></Column>
        <Column>
          <Text style={styles.stepTitle}>Invite your team</Text>
          <Text style={styles.stepBody}>Go to Settings → Team to invite reps and managers. Each rep will receive an email with a login link.</Text>
        </Column>
      </Row>

      <Hr style={styles.hr} />

      {/* CTA */}
      <Section style={{ textAlign: "center", padding: "16px 0 8px" }}>
        <Button href={dashboard_url} style={styles.ctaButton}>
          Open Dashboard
        </Button>
      </Section>

      <Text style={styles.helpText}>
        Need help? Reply to this email — we&apos;ll get back to you within 24 hours.
      </Text>
    </BaseEmail>
  )
}

export default WelcomeAdmin

const styles = {
  h1: {
    color: "#09090b",
    fontSize: "24px",
    fontWeight: "700",
    margin: "0 0 8px",
    lineHeight: "1.3",
  },
  h2: {
    color: "#09090b",
    fontSize: "16px",
    fontWeight: "600",
    margin: "0 0 16px",
  },
  subheading: {
    color: "#52525b",
    fontSize: "15px",
    margin: "0 0 24px",
    lineHeight: "1.5",
  },
  responsibilityBox: {
    backgroundColor: "#f4f4f5",
    borderRadius: "8px",
    padding: "20px 24px",
  },
  responsibilityTitle: {
    color: "#09090b",
    fontSize: "14px",
    fontWeight: "600",
    margin: "0 0 16px",
  },
  icon: {
    fontSize: "18px",
    margin: "0",
    lineHeight: "1.4",
  },
  respItemTitle: {
    color: "#09090b",
    fontSize: "13px",
    fontWeight: "600",
    margin: "0 0 2px",
  },
  respItemBody: {
    color: "#52525b",
    fontSize: "13px",
    margin: "0",
    lineHeight: "1.4",
  },
  hr: {
    borderColor: "#e4e4e7",
    margin: "24px 0",
  },
  stepNum: {
    width: "32px",
    verticalAlign: "top" as const,
  },
  stepNumText: {
    backgroundColor: "#09090b",
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: "700",
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    textAlign: "center" as const,
    lineHeight: "24px",
    margin: "0",
  },
  stepTitle: {
    color: "#09090b",
    fontSize: "14px",
    fontWeight: "600",
    margin: "0 0 2px",
  },
  stepBody: {
    color: "#52525b",
    fontSize: "13px",
    margin: "0",
    lineHeight: "1.4",
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
  helpText: {
    color: "#71717a",
    fontSize: "13px",
    textAlign: "center" as const,
    margin: "16px 0 0",
  },
}
