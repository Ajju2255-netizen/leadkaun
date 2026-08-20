/**
 * The import template, and the single source of truth for what a good file
 * looks like.
 *
 * This used to live inside the import page next to the download button. The
 * page now also shows a worked example above the dropzone, and two hand
 * maintained copies of the same thing drift, so the preview is derived from
 * this constant rather than written out again.
 *
 * Formats in the rows are deliberate. They demonstrate that Indian phone
 * spellings, lakh and crore amounts, and plain rupee figures all parse, so
 * nobody reformats a working file before uploading it.
 */

/** Only these two are needed for a row to import. */
export const REQUIRED_COLUMNS = ["name", "phone"] as const

/** Everything else is optional, and each one makes the grading sharper. */
export const OPTIONAL_COLUMNS = [
  "email", "company", "designation", "city", "state",
  "pincode", "budget", "interest_level", "last_contact_days", "notes",
] as const

export const SAMPLE_CSV =
  "name,phone,email,company,designation,city,state,pincode,budget,interest_level,last_contact_days,notes\n" +
  "Rohan Sharma,98765 43210,rohan@example.com,Acme Realty,Director,Bangalore,Karnataka,560066,25L,High,1,Wants a 3BHK in Whitefield and asked for a site visit\n" +
  "Priya Nair,+91 99887 76655,priya@example.com,Nair Exports,Owner,Mumbai,Maharashtra,400001,1.2Cr,Medium,3,Requested a callback next week\n" +
  "Imran Khan,9812345678,,,Manager,Lucknow,Uttar Pradesh,226001,500000,Low,10,Comparing vendors with no urgency yet\n"

export const TEMPLATE_FILENAME = "leadkaun-import-template.csv"

/**
 * The template as a header row plus data rows, for rendering a preview.
 *
 * Split on commas without quote handling on purpose: the constant above is
 * ours and contains no quoted fields. Papa is not worth pulling in to read a
 * literal we wrote.
 */
export function templatePreview(columns: number = 3): { headers: string[]; rows: string[][] } {
  const [head, ...body] = SAMPLE_CSV.trim().split("\n")
  const headers = head.split(",").slice(0, columns)
  const rows = body.map((line) => line.split(",").slice(0, columns))
  return { headers, rows }
}

/** Writes the template to the visitor's machine. Browser only. */
export function downloadSampleCsv(): void {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = TEMPLATE_FILENAME
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
