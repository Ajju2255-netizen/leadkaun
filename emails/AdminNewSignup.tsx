import { Heading, Text, Section, Link, Hr } from "@react-email/components"
import * as React from "react"
import { BaseEmail } from "./layout/BaseEmail"

export type NewSignupItem = {
  name: string
  industry: string
  city: string
  ownerName: string | null
  ownerEmail: string | null
  source: string | null
  teamSize: string
  monthlyLeadVolume: string
  adminUrl: string
  signedUpAt: string
}

/**
 * INTERNAL email — goes to platform admins, never to a customer. Deliberately
 * plain: the point is that someone reads it on a phone within minutes of a
 * signup and knows whether to reach out, not that it looks like a product email.
 */
export function AdminNewSignup({ signups, dashboardUrl }: { signups: NewSignupItem[]; dashboardUrl: string }) {
  const n = signups.length
  const preview = n === 1
    ? `${signups[0].name} just signed up for Leadkaun`
    : `${n} new Leadkaun signups`

  return (
    <BaseEmail preview={preview}>
      <Heading style={h1}>{n === 1 ? "New signup" : `${n} new signups`}</Heading>
      <Text style={intro}>
        {n === 1 ? "A company just created a Leadkaun account." : `${n} companies just created Leadkaun accounts.`}{" "}
        Nobody has onboarded them yet.
      </Text>

      {signups.map((s, i) => (
        <Section key={i} style={card}>
          <Text style={company}>{s.name}</Text>
          <Text style={meta}>
            {[s.industry, s.city].filter(Boolean).join(" · ")}
            {s.teamSize && ` · team ${s.teamSize.toLowerCase()}`}
            {s.monthlyLeadVolume && ` · ${s.monthlyLeadVolume.toLowerCase().replace(/_/g, " ")} leads/mo`}
          </Text>
          {s.ownerEmail && (
            <Text style={meta}>
              {s.ownerName ? `${s.ownerName} — ` : ""}
              <Link href={`mailto:${s.ownerEmail}`} style={link}>{s.ownerEmail}</Link>
            </Text>
          )}
          <Text style={meta}>
            {s.source ? `Came via ${s.source}` : "Direct — no attribution captured"} · {s.signedUpAt}
          </Text>
          <Text style={{ margin: "10px 0 0" }}>
            <Link href={s.adminUrl} style={button}>Open in Mission Control</Link>
          </Text>
        </Section>
      ))}

      <Hr style={hr} />
      <Text style={footer}>
        <Link href={dashboardUrl} style={link}>See the full business scorecard</Link> — signups, account mix and
        revenue over any window.
      </Text>
      <Text style={footer}>
        You are receiving this because your address is a Leadkaun platform admin.
      </Text>
    </BaseEmail>
  )
}

export default AdminNewSignup

const h1 = { fontSize: "20px", fontWeight: 700, color: "#0F172A", margin: "0 0 6px" }
const intro = { fontSize: "14px", color: "#475569", lineHeight: "22px", margin: "0 0 18px" }
const card = {
  border: "1px solid #E2E8F0",
  borderRadius: "12px",
  padding: "14px 16px",
  marginBottom: "12px",
  backgroundColor: "#F8FAFC",
}
const company = { fontSize: "16px", fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }
const meta = { fontSize: "13px", color: "#64748B", margin: "0 0 2px", lineHeight: "20px" }
const link = { color: "#0EA5E9", textDecoration: "underline" }
const button = {
  display: "inline-block",
  backgroundColor: "#0EA5E9",
  color: "#FFFFFF",
  fontSize: "13px",
  fontWeight: 600,
  padding: "8px 14px",
  borderRadius: "999px",
  textDecoration: "none",
}
const hr = { borderColor: "#E2E8F0", margin: "20px 0 14px" }
const footer = { fontSize: "12px", color: "#94A3B8", margin: "0 0 4px", lineHeight: "18px" }
