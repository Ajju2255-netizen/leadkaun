// UI/UX screenshot helper. Usage: node scripts/uiux-shot.mjs <outDir> <WxH> <baseUrl> <route...>
import { chromium } from "@playwright/test"
import { mkdirSync } from "fs"
const [outDir, viewport, baseUrl, ...routes] = process.argv.slice(2)
const [w, h] = viewport.split("x").map(Number)
mkdirSync(outDir, { recursive: true })
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:1 }); const p = await ctx.newPage()
for (const r of routes) {
  const slug = (r.replace(/^\//,"").replace(/\//g,"-")||"home")+`-${w}`
  try { await p.goto(baseUrl+r,{waitUntil:"networkidle",timeout:30000}); await p.waitForTimeout(1400); await p.screenshot({path:`${outDir}/${slug}.png`,fullPage:true}); console.log(`${r} -> ${outDir}/${slug}.png`) }
  catch(e){ console.log(`${r} -> ERROR ${String(e).slice(0,100)}`) }
}
await b.close()
