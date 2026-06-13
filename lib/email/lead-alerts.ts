import * as React from "react"
import { sendEmail } from "./send"
import { WelcomeAdmin } from "@/emails/WelcomeAdmin"
import { SqlAlert } from "@/emails/SqlAlert"
import { GradeDrop } from "@/emails/GradeDrop"

/**
 * Transactional/behavioural email dispatchers (audit B8).
 *
 * WelcomeAdmin, SqlAlert and GradeDrop were fully built but never wired to any
 * send path. These helpers connect them to their trigger points (registration,
 * SQL crossing, grade drop). All are fire-and-forget: they never throw into the
 * caller — a failed email must not break a signup, a signal log, or a cron run.
 * (Note: emails won't actually deliver until the Resend sending domain is
 * verified — audit O2 — but wiring them is correct and harmless until then.)
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.leadkaun.com"

export async function sendWelcomeAdminEmail(opts: {
  to: string
  adminFirstName: string
  orgName: string
}): Promise<void> {
  try {
    await sendEmail({
      to:      opts.to,
      subject: `Welcome to Leadkaun, ${opts.adminFirstName}`,
      react:   React.createElement(WelcomeAdmin, {
        admin_first_name: opts.adminFirstName,
        org_name:         opts.orgName,
        dashboard_url:    `${APP_URL}/dashboard`,
      }),
    })
  } catch (e) {
    console.warn("[email] welcome-admin failed:", String(e))
  }
}

export async function sendSqlAlertEmail(opts: {
  to: string
  recipientName: string
  leadId: string
  leadFirstName: string
  leadLastName: string | null
  leadCompany: string | null
  grade: string
  fitScore: number
  intentScore: number
}): Promise<void> {
  try {
    await sendEmail({
      to:      opts.to,
      subject: `🎯 SQL Alert: ${`${opts.leadFirstName} ${opts.leadLastName ?? ""}`.trim()} just qualified`,
      react:   React.createElement(SqlAlert, {
        recipient_name:  opts.recipientName,
        lead_first_name: opts.leadFirstName,
        lead_last_name:  opts.leadLastName,
        lead_company:    opts.leadCompany,
        grade:           opts.grade,
        fit_score:       opts.fitScore,
        intent_score:    opts.intentScore,
        nba:             "Call now — this lead just crossed the SQL threshold.",
        lead_url:        `${APP_URL}/leads/${opts.leadId}`,
      }),
    })
  } catch (e) {
    console.warn("[email] sql-alert failed:", String(e))
  }
}

export async function sendGradeDropEmail(opts: {
  to: string
  recipientName: string
  leadId: string
  leadFirstName: string
  leadLastName: string | null
  leadCompany: string | null
  gradeFrom: string
  gradeTo: string
  expectedValue: number | null
  daysSinceContact: number
  reason: string
}): Promise<void> {
  try {
    await sendEmail({
      to:      opts.to,
      subject: `⚠️ Grade drop: ${`${opts.leadFirstName} ${opts.leadLastName ?? ""}`.trim()} (${opts.gradeFrom} → ${opts.gradeTo})`,
      react:   React.createElement(GradeDrop, {
        recipient_name:     opts.recipientName,
        lead_first_name:    opts.leadFirstName,
        lead_last_name:     opts.leadLastName,
        lead_company:       opts.leadCompany,
        grade_from:         opts.gradeFrom,
        grade_to:           opts.gradeTo,
        expected_value:     opts.expectedValue,
        days_since_contact: opts.daysSinceContact,
        reason:             opts.reason,
        lead_url:           `${APP_URL}/leads/${opts.leadId}`,
      }),
    })
  } catch (e) {
    console.warn("[email] grade-drop failed:", String(e))
  }
}
