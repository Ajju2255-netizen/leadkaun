import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Hr,
} from "@react-email/components"
import * as React from "react"

interface BaseEmailProps {
  preview: string
  children: React.ReactNode
  unsubscribeUrl?: string
}

export function BaseEmail({ preview, children, unsubscribeUrl }: BaseEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* Header */}
          <Section style={styles.header}>
            <Text style={styles.brandName}>Leadkaun</Text>
            <Text style={styles.tagline}>Sales Behaviour OS</Text>
          </Section>

          {/* Content */}
          <Section style={styles.content}>{children}</Section>

          {/* Footer */}
          <Hr style={styles.hr} />
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              You are receiving this email because you are a member of your organisation on Leadkaun.
            </Text>
            {unsubscribeUrl && (
              <Text style={styles.footerText}>
                <Link href={unsubscribeUrl} style={styles.footerLink}>
                  Unsubscribe from these emails
                </Link>
              </Text>
            )}
            <Text style={styles.footerText}>
              © {new Date().getFullYear()} Leadkaun. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const styles = {
  body: {
    backgroundColor: "#f4f4f5",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    margin: "0",
    padding: "0",
  },
  container: {
    backgroundColor: "#ffffff",
    margin: "40px auto",
    maxWidth: "600px",
    borderRadius: "8px",
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  header: {
    backgroundColor: "#09090b",
    padding: "24px 32px",
    textAlign: "left" as const,
  },
  brandName: {
    color: "#ffffff",
    fontSize: "22px",
    fontWeight: "700",
    margin: "0",
    lineHeight: "1.2",
  },
  tagline: {
    color: "#a1a1aa",
    fontSize: "11px",
    fontWeight: "500",
    margin: "2px 0 0",
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
  },
  content: {
    padding: "32px",
  },
  hr: {
    borderColor: "#e4e4e7",
    margin: "0 32px",
  },
  footer: {
    padding: "24px 32px",
  },
  footerText: {
    color: "#71717a",
    fontSize: "12px",
    lineHeight: "1.5",
    margin: "0 0 6px",
  },
  footerLink: {
    color: "#71717a",
    textDecoration: "underline",
  },
}
