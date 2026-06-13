#!/usr/bin/env node
/**
 * Mobile + tablet responsive sweep for the Leadkaun dashboard.
 *
 * Logs in as the e2e test user and screenshots every dashboard route at
 * 375×812 (iPhone 12) and 768×1024 (iPad) viewports. Outputs to
 * qa-screenshots/{mobile,tablet}/<slug>.png — gitignored, intended as a
 * local triage queue, not a regression baseline.
 *
 * Usage:
 *   1. Ensure local dev server is running on http://localhost:3000
 *   2. node scripts/responsive-audit.mjs
 *   3. Open the qa-screenshots/ folders side-by-side and fix layout breaks
 *      case-by-case (typical issues: table overflow, clipped CTAs, sidebar
 *      collapse, header wrap).
 *
 * Safety: refuses to run if DATABASE_URL contains "prod" / "production"
 * to avoid screenshotting real customer data. The dev server's own DB
 * connection determines this — script never touches the DB directly.
 *
 * Closes deferred Launch Readiness item 2 (mobile/tablet breakpoint audit).
 */

import fs from "node:fs"
import path from "node:path"
import { chromium } from "@playwright/test"

// ── Config ─────────────────────────────────────────────────────────────────

const BASE_URL = process.env.APP_URL ?? "http://localhost:3000"
const EMAIL    = process.env.E2E_EMAIL    ?? "e2e@leadkaun.test"
const PASSWORD = process.env.E2E_PASSWORD ?? "E2EPass2026!"
const OUT_DIR  = path.resolve(process.cwd(), "qa-screenshots")

const ROUTES = [
  "/queue",
  "/leads",
  "/pipeline",
  "/missed",
  "/follow-ups",
  "/notifications",
  "/analytics",
  "/rep-tracking",
  "/settings/org",
  "/settings/profile",
  "/settings/team",
  "/settings/templates",
  "/settings/security",
  "/settings/sources",
  "/settings/icp",
]

const VIEWPORTS = [
  { name: "mobile", width: 375,  height: 812  },
  { name: "tablet", width: 768,  height: 1024 },
]

// ── Safety ─────────────────────────────────────────────────────────────────

if (/prod/i.test(process.env.DATABASE_URL ?? "")) {
  console.error("ABORT: DATABASE_URL looks like production — refusing to run")
  process.exit(1)
}

// ── Helpers ────────────────────────────────────────────────────────────────

function slug(route) {
  return route.replace(/^\//, "").replace(/\//g, "_") || "root"
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

async function login(page) {
  console.log(`→ Logging in as ${EMAIL}`)
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" })
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  // Wait either for redirect off /login, OR for an error message to appear
  try {
    await page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 10000 })
  } catch {
    // Pull the error from the page for actionable diagnostics
    const err = await page.locator('[role="alert"], .text-red-500, .text-red-600').first()
      .textContent({ timeout: 1000 }).catch(() => null)
    throw new Error(err ? `Supabase: ${err.trim()}` : "no redirect, no error message")
  }
  console.log(`  ✓ Logged in → ${page.url()}`)
}

// ── Main ───────────────────────────────────────────────────────────────────

const browser = await chromium.launch()
let routesShot = 0

try {
  for (const vp of VIEWPORTS) {
    const dir = path.join(OUT_DIR, vp.name)
    ensureDir(dir)

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    })
    const page = await context.newPage()

    try {
      await login(page)
    } catch (e) {
      console.error(`✗ Login failed at viewport ${vp.name}: ${e.message}`)
      console.error("  Hint: run `node scripts/e2e-provision.js` to seed the e2e user.")
      console.error("  Falling back: capturing public surfaces only (login + register).")
      for (const route of ["/login", "/register"]) {
        const file = path.join(dir, `${slug(route)}.png`)
        await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded", timeout: 15000 })
        await page.waitForTimeout(400)
        await page.screenshot({ path: file, fullPage: true })
        console.log(`  [${vp.name} ${vp.width}×${vp.height}] ${route} → ${path.relative(process.cwd(), file)}`)
        routesShot++
      }
      await context.close()
      continue
    }

    for (const route of ROUTES) {
      const file = path.join(dir, `${slug(route)}.png`)
      try {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle", timeout: 20000 })
      } catch {
        // networkidle can be flaky on Next.js dev; fall back to domcontentloaded
        await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded", timeout: 20000 })
      }
      // Give client components a beat to paint
      await page.waitForTimeout(800)
      await page.screenshot({ path: file, fullPage: true })
      console.log(`  [${vp.name} ${vp.width}×${vp.height}] ${route} → ${path.relative(process.cwd(), file)}`)
      routesShot++
    }
    await context.close()
  }
} finally {
  await browser.close()
}

console.log(`\n✓ ${routesShot} screenshots → ${path.relative(process.cwd(), OUT_DIR)}/`)
console.log("  Triage hotspots: /leads (table overflow), /rep-tracking (5-bar layout), /missed (grade tabs)")
