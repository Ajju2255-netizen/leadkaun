"use client"

import { Check, Download } from "lucide-react"

import {
  REQUIRED_COLUMNS,
  OPTIONAL_COLUMNS,
  downloadSampleCsv,
  templatePreview,
} from "@/lib/import/template"

/**
 * What a good file looks like, stated before the dropzone rather than under it.
 *
 * All of this existed already: a "Required: name, phone" line and a template
 * download, both sitting below the upload area where someone preparing a file
 * had already scrolled past them. People stalled here because the page never
 * told them what to bring. Same facts, moved to where the decision is made,
 * plus a worked example so the shape is obvious without opening the file.
 *
 * The preview is derived from the template constant, so the example on screen
 * and the file they download can never disagree.
 */
export function RequiredColumnsCard() {
  const { headers, rows } = templatePreview(3)

  return (
    <div
      data-tour="import.required"
      className="rounded-xl border border-sky-100 bg-sky-50/40 p-4 sm:p-5 space-y-4"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-[13px] font-semibold text-ink">You need two columns</p>
        <p className="text-[12.5px] text-ink-soft">Everything else is optional.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {REQUIRED_COLUMNS.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1.5 h-7 pl-2 pr-3 rounded-lg bg-white border border-sky-200 font-mono text-[12px] font-semibold text-ink"
          >
            <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-100 text-emerald-600">
              <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
            </span>
            {c}
          </span>
        ))}
      </div>

      <div>
        <p className="text-[11.5px] text-ink-muted leading-relaxed">
          Optional, and each one makes the grading sharper:{" "}
          <span className="font-mono text-[11px] text-ink-soft">{OPTIONAL_COLUMNS.join(", ")}</span>
        </p>
      </div>

      {/* A worked example beats a column list. Three columns is enough to show
          the shape without needing a horizontal scroll on a phone. */}
      <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 font-mono text-[11px] font-semibold text-ink-soft border-b border-slate-100 whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td
                    key={j}
                    className="px-3 py-1.5 text-[12px] text-ink border-b border-slate-50 last:border-0 whitespace-nowrap"
                  >
                    {cell || <span className="text-ink-faint">empty</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={downloadSampleCsv}
          className="btn-secondary inline-flex items-center gap-1.5 h-9 px-3.5 text-[12.5px]"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={2.2} />
          Download the template
        </button>
        <p className="text-[11.5px] text-ink-muted">
          Download it, paste your leads into it, and drop it back here.
        </p>
      </div>

      <p className="text-[11.5px] text-ink-muted leading-relaxed">
        Your own column names are matched automatically, so <span className="font-mono">Mobile No</span> and{" "}
        <span className="font-mono">Full Name</span> both work. You do not need to rename anything.
      </p>
    </div>
  )
}
