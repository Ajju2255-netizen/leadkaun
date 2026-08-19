/**
 * Sample workspace fixtures.
 *
 * A brand-new account has nothing in it, so every screen reads as broken rather
 * than empty — which is the single biggest reason a signup never reaches the
 * point of importing. This gives them a second workspace with a realistic,
 * already-graded pipeline they can click through immediately.
 *
 * Composition is chosen so that EVERY major screen has something to show:
 *   · Queue          — a spread of A–E with hot signals at the top
 *   · Missed         — leads past their follow-up window, with ₹ attached
 *   · Rep Tracking   — wins with values and speed-to-lead figures
 *   · Pipeline       — leads spread across the default stages
 *
 * Names, companies and numbers are invented. Phone numbers use the 555-style
 * reserved-looking range (+9198XXX00NNN) so a demo click can never dial a real
 * person. Every row is tagged `custom_values.sample = true` as a belt-and-braces
 * marker in case a row ever escapes its workspace.
 */

export type SampleLead = {
  first_name: string
  last_name: string
  company_name: string
  city: string
  grade: "A" | "B" | "C" | "D" | "E"
  fit: number
  intent: number
  quality: number
  /** Which bucket this lead demonstrates. Drives dates/flags at insert time. */
  kind: "hot" | "working" | "missed" | "won" | "cold"
  note: string
  /** Deal value in ₹ — used for won leads and for ₹-at-risk on missed ones. */
  value?: number
}

export const SAMPLE_LEADS: SampleLead[] = [
  // ── Hot: the top of the queue, the thing we want them to see first ──────────
  { first_name: "Priya",  last_name: "Sharma",   company_name: "Sunrise Realty",      city: "Pune",      grade: "A", fit: 88, intent: 92, quality: 84, kind: "hot",     value: 420000, note: "Asked for pricing on WhatsApp" },
  { first_name: "Rahul",  last_name: "Mehta",    company_name: "Apex Capital",        city: "Mumbai",    grade: "A", fit: 84, intent: 90, quality: 80, kind: "hot",     value: 280000, note: "Replied, wants a walkthrough" },
  { first_name: "Vikram", last_name: "Desai",    company_name: "Deccan Motors",       city: "Pune",      grade: "B", fit: 76, intent: 71, quality: 78, kind: "hot",     value: 150000, note: "Booked a site visit" },

  // ── Missed: the ₹-at-risk story, the product's sharpest hook ────────────────
  { first_name: "Rohit",  last_name: "Iyer",     company_name: "Nashik Agro",         city: "Nashik",    grade: "A", fit: 82, intent: 74, quality: 76, kind: "missed",  value: 220000, note: "Went quiet after the first reply" },
  { first_name: "Kavita", last_name: "Menon",    company_name: "Trivandrum Homes",    city: "Kochi",     grade: "A", fit: 80, intent: 68, quality: 72, kind: "missed",  value: 170000, note: "Site visit booked, no follow-up" },
  { first_name: "Sameer", last_name: "Joshi",    company_name: "Indore Plastics",     city: "Indore",    grade: "B", fit: 70, intent: 62, quality: 68, kind: "missed",  value: 110000, note: "Asked for a revised quote" },
  { first_name: "Farah",  last_name: "Sheikh",   company_name: "Hyderabad Tutors",    city: "Hyderabad", grade: "B", fit: 68, intent: 58, quality: 66, kind: "missed",  value: 80000,  note: "Two replies, then silence" },

  // ── Won: gives Rep Tracking and the revenue widgets real numbers ────────────
  { first_name: "Anjali", last_name: "Rao",      company_name: "BrightEdu Institute", city: "Bengaluru", grade: "A", fit: 90, intent: 88, quality: 86, kind: "won",     value: 350000, note: "Closed after a two-week cycle" },
  { first_name: "Imran",  last_name: "Khan",     company_name: "Metro Logistics",     city: "Delhi",     grade: "A", fit: 86, intent: 84, quality: 82, kind: "won",     value: 500000, note: "Referral, closed fast" },
  { first_name: "Deepa",  last_name: "Nair",     company_name: "Kochi Clinics",       city: "Kochi",     grade: "B", fit: 74, intent: 76, quality: 74, kind: "won",     value: 190000, note: "Negotiated on annual terms" },

  // ── Working: the honest middle of a pipeline ───────────────────────────────
  { first_name: "Arjun",  last_name: "Nair",     company_name: "Kochi Exports",       city: "Kochi",     grade: "B", fit: 72, intent: 64, quality: 70, kind: "working", value: 130000, note: "Opened the quote, no reply yet" },
  { first_name: "Neha",   last_name: "Kulkarni", company_name: "Sahyadri Interiors",  city: "Pune",      grade: "B", fit: 69, intent: 60, quality: 67, kind: "working", value: 95000,  note: "Enquiry from a listing site" },
  { first_name: "Sanjay", last_name: "Gupta",    company_name: "Jaipur Textiles",     city: "Jaipur",    grade: "C", fit: 58, intent: 48, quality: 60, kind: "working", value: 70000,  note: "Comparing three vendors" },
  { first_name: "Meera",  last_name: "Pillai",   company_name: "Coastal Foods",       city: "Mangaluru", grade: "C", fit: 55, intent: 45, quality: 58, kind: "working", value: 60000,  note: "Wants a callback next week" },
  { first_name: "Aditya", last_name: "Verma",    company_name: "Lucknow Builders",    city: "Lucknow",   grade: "C", fit: 54, intent: 44, quality: 56, kind: "working", value: 85000,  note: "Budget not confirmed" },
  { first_name: "Ritu",   last_name: "Chawla",   company_name: "Chandigarh Decor",    city: "Chandigarh",grade: "C", fit: 52, intent: 42, quality: 55, kind: "working", value: 50000,  note: "Downloaded the brochure twice" },
  { first_name: "Karan",  last_name: "Singh",    company_name: "Amritsar Motors",     city: "Amritsar",  grade: "B", fit: 66, intent: 59, quality: 64, kind: "working", value: 120000, note: "Asked about financing" },
  { first_name: "Sneha",  last_name: "Patil",    company_name: "Nagpur Interiors",    city: "Nagpur",    grade: "B", fit: 65, intent: 57, quality: 63, kind: "working", value: 105000, note: "Shortlisted, deciding this month" },

  // ── Cold: proves grading actually separates junk from real demand ───────────
  { first_name: "Manoj",  last_name: "Bhat",     company_name: "—",                   city: "Surat",     grade: "D", fit: 38, intent: 26, quality: 42, kind: "cold",    note: "Personal email, no company" },
  { first_name: "Suresh", last_name: "Reddy",    company_name: "Vizag Traders",       city: "Vizag",     grade: "D", fit: 36, intent: 24, quality: 40, kind: "cold",    note: "Out of service area" },
  { first_name: "Pooja",  last_name: "Jain",     company_name: "—",                   city: "Bhopal",    grade: "D", fit: 34, intent: 22, quality: 38, kind: "cold",    note: "Student enquiry" },
  { first_name: "Ravi",   last_name: "Kumar",    company_name: "—",                   city: "Patna",     grade: "E", fit: 22, intent: 14, quality: 30, kind: "cold",    note: "No response in nine days" },
  { first_name: "Anita",  last_name: "Das",      company_name: "—",                   city: "Kolkata",   grade: "E", fit: 20, intent: 12, quality: 28, kind: "cold",    note: "Wrong number on the form" },
  { first_name: "Gopal",  last_name: "Iyengar",  company_name: "Mysuru Crafts",       city: "Mysuru",    grade: "E", fit: 18, intent: 10, quality: 26, kind: "cold",    note: "Enquired two years ago" },
]

/** Reserved-looking demo numbers — a demo click can never dial a real person. */
export function samplePhone(i: number): string {
  return `+919800${String(100 + i).padStart(5, "0")}`
}
