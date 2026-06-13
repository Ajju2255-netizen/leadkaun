// Pipeline DnD smoke test — drags the first card from column 1 to column 2 and
// asserts the "Moved to <stage>" toast. Uses synthetic DragEvents with a shared
// DataTransfer (Playwright's mouse drag doesn't trigger native HTML5 DnD).
import { chromium } from "@playwright/test"
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
await page.goto("http://localhost:3000/pipeline", { waitUntil: "networkidle", timeout: 30000 })
await page.waitForTimeout(2000)

const info = await page.evaluate(() => {
  const cols = [...document.querySelectorAll("div")].filter((d) => /\bw-\[270px\]/.test(d.className))
  if (cols.length < 2) return { error: `only ${cols.length} columns` }
  const srcCard = cols[0].querySelector('[draggable="true"]')
  if (!srcCard) return { error: "no draggable card in column 1" }
  const name = srcCard.querySelector("p")?.textContent?.trim()
  const targetHeader = cols[1].querySelector("p")?.textContent?.trim()
  const dt = new DataTransfer()
  srcCard.dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true }))
  cols[1].dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }))
  cols[1].dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }))
  srcCard.dispatchEvent(new DragEvent("dragend", { dataTransfer: dt, bubbles: true }))
  return { name, target: targetHeader, leadId: dt.getData("text/lead-id"), fromStage: dt.getData("text/from-stage") }
})
console.log("drag:", JSON.stringify(info))

let moved = false
try { await page.getByText(/Moved to/i).waitFor({ timeout: 8000 }); moved = true } catch {}
const toastText = await page.getByText(/Moved to/i).first().textContent().catch(() => "")
console.log(`move toast: ${moved ? "✅ " + (toastText||"").trim() : "❌ NO"}`)
await page.screenshot({ path: "qa-screenshots/uiux/smoke-pipeline-dnd.png" })
await browser.close()
process.exit(moved ? 0 : 1)
