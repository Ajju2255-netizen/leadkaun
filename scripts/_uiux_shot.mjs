// Reusable UI/UX screenshot helper for the in-depth design audit.
// Usage: node scripts/_uiux_shot.mjs <outDir> <width>x<height> <baseUrl> <route...>
// Example: node scripts/_uiux_shot.mjs qa-screenshots/uiux/queue 1440x900 http://localhost:3000 /queue /dashboard
import { chromium } from "@playwright/test"
import { mkdirSync } from "fs"

const [outDir, viewport, baseUrl, ...routes] = process.argv.slice(2)
const [w, h] = viewport.split("x").map(Number)
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
const page = await ctx.newPage()

for (const route of routes) {
  const slug = (route.replace(/^\//, "").replace(/\//g, "-") || "home") + `-${w}`
  try {
    await page.goto(baseUrl + route, { waitUntil: "networkidle", timeout: 30000 })
    await page.waitForTimeout(1400)
    await page.screenshot({ path: `${outDir}/${slug}.png`, fullPage: true })
    // Report horizontal-overflow + final URL (catches redirects) for the agent.
    const info = await page.evaluate(() => ({
      url: location.pathname,
      docW: document.documentElement.scrollWidth,
      viewW: document.documentElement.clientWidth,
    }))
    console.log(`${route} -> ${info.url} | ${outDir}/${slug}.png | docW=${info.docW}/${info.viewW}${info.docW > info.viewW + 1 ? " H-OVERFLOW" : ""}`)
  } catch (e) {
    console.log(`${route} -> ERROR ${String(e).slice(0, 120)}`)
  }
}
await browser.close()
