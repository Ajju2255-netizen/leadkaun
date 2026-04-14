/**
 * Lead enrichment — fills in gaps that CSV data commonly misses.
 *
 * This runs AFTER validateRow and BEFORE scoring so the scoring engine
 * receives the best possible input.  All functions are pure (no DB calls).
 *
 * Covers:
 *   1. City → State:  most Indian CSVs have city but not state column.
 *                     Maps 100+ major cities to their state so geography
 *                     ICP matching works correctly.
 *   2. Company → Industry:  basic keyword inference when no industry column.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. City → State
// ─────────────────────────────────────────────────────────────────────────────

const CITY_STATE_MAP: Record<string, string> = {
  // Maharashtra
  mumbai: "Maharashtra", pune: "Maharashtra", nagpur: "Maharashtra",
  nashik: "Maharashtra", aurangabad: "Maharashtra", thane: "Maharashtra",
  solapur: "Maharashtra", kolhapur: "Maharashtra", "navi mumbai": "Maharashtra",
  pimpri: "Maharashtra", chinchwad: "Maharashtra", amravati: "Maharashtra",

  // Karnataka
  bangalore: "Karnataka", bengaluru: "Karnataka", mysore: "Karnataka",
  mysuru: "Karnataka", hubli: "Karnataka", dharwad: "Karnataka",
  mangalore: "Karnataka", mangaluru: "Karnataka", belgaum: "Karnataka",
  belagavi: "Karnataka", tumkur: "Karnataka", davangere: "Karnataka",

  // Tamil Nadu
  chennai: "Tamil Nadu", coimbatore: "Tamil Nadu", madurai: "Tamil Nadu",
  tiruchirappalli: "Tamil Nadu", trichy: "Tamil Nadu", salem: "Tamil Nadu",
  tirunelveli: "Tamil Nadu", tiruppur: "Tamil Nadu", vellore: "Tamil Nadu",
  erode: "Tamil Nadu",

  // Telangana
  hyderabad: "Telangana", warangal: "Telangana", nizamabad: "Telangana",
  karimnagar: "Telangana", secunderabad: "Telangana",

  // Gujarat
  ahmedabad: "Gujarat", surat: "Gujarat", vadodara: "Gujarat",
  baroda: "Gujarat", rajkot: "Gujarat", bhavnagar: "Gujarat",
  jamnagar: "Gujarat", gandhinagar: "Gujarat", anand: "Gujarat",

  // Rajasthan
  jaipur: "Rajasthan", jodhpur: "Rajasthan", udaipur: "Rajasthan",
  kota: "Rajasthan", bikaner: "Rajasthan", ajmer: "Rajasthan",

  // Uttar Pradesh
  lucknow: "Uttar Pradesh", kanpur: "Uttar Pradesh", agra: "Uttar Pradesh",
  varanasi: "Uttar Pradesh", meerut: "Uttar Pradesh", allahabad: "Uttar Pradesh",
  prayagraj: "Uttar Pradesh", ghaziabad: "Uttar Pradesh", noida: "Uttar Pradesh",
  "greater noida": "Uttar Pradesh", bareilly: "Uttar Pradesh",

  // Delhi
  delhi: "Delhi", "new delhi": "Delhi", dwarka: "Delhi",
  gurgaon: "Haryana", gurugram: "Haryana", faridabad: "Haryana",
  panipat: "Haryana", ambala: "Haryana", rohtak: "Haryana",

  // West Bengal
  kolkata: "West Bengal", calcutta: "West Bengal", howrah: "West Bengal",
  durgapur: "West Bengal", asansol: "West Bengal", siliguri: "West Bengal",

  // Madhya Pradesh
  bhopal: "Madhya Pradesh", indore: "Madhya Pradesh", jabalpur: "Madhya Pradesh",
  gwalior: "Madhya Pradesh", ujjain: "Madhya Pradesh", ratlam: "Madhya Pradesh",

  // Punjab
  ludhiana: "Punjab", amritsar: "Punjab", jalandhar: "Punjab",
  patiala: "Punjab", bathinda: "Punjab",

  // Bihar
  patna: "Bihar", gaya: "Bihar", muzaffarpur: "Bihar", bhagalpur: "Bihar",

  // Odisha
  bhubaneswar: "Odisha", cuttack: "Odisha", rourkela: "Odisha",

  // Andhra Pradesh
  visakhapatnam: "Andhra Pradesh", vizag: "Andhra Pradesh",
  vijayawada: "Andhra Pradesh", guntur: "Andhra Pradesh",
  tirupati: "Andhra Pradesh",

  // Kerala
  thiruvananthapuram: "Kerala", trivandrum: "Kerala",
  kochi: "Kerala", cochin: "Kerala", kozhikode: "Kerala",
  calicut: "Kerala", thrissur: "Kerala",

  // Jharkhand
  ranchi: "Jharkhand", jamshedpur: "Jharkhand", dhanbad: "Jharkhand",

  // Assam
  guwahati: "Assam", dibrugarh: "Assam", silchar: "Assam",

  // Chhattisgarh
  raipur: "Chhattisgarh", bhilai: "Chhattisgarh", bilaspur: "Chhattisgarh",

  // Uttarakhand
  dehradun: "Uttarakhand", haridwar: "Uttarakhand", roorkee: "Uttarakhand",

  // Himachal Pradesh
  shimla: "Himachal Pradesh", chandigarh: "Punjab",

  // Goa
  panaji: "Goa", margao: "Goa", vasco: "Goa",
}

/**
 * Returns the state for a given city name, or null if not found.
 * Case-insensitive.
 */
export function mapCityToState(city: string | null | undefined): string | null {
  if (!city) return null
  return CITY_STATE_MAP[city.toLowerCase().trim()] ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Company → Industry (keyword inference)
// ─────────────────────────────────────────────────────────────────────────────

const INDUSTRY_KEYWORDS: Array<{ industry: string; keywords: string[] }> = [
  { industry: "Real Estate",    keywords: ["realty", "real estate", "builders", "infra", "developers", "properties", "housing", "homes", "construction"] },
  { industry: "Manufacturing",  keywords: ["industries", "manufacturing", "fabrication", "works", "factory", "mills", "forge", "casting"] },
  { industry: "Technology",     keywords: ["tech", "software", "solutions", "systems", "digital", "it ", "data", "cloud", "ai", "app"] },
  { industry: "Healthcare",     keywords: ["hospital", "clinic", "pharma", "health", "medical", "care", "labs", "diagnostics"] },
  { industry: "Finance",        keywords: ["finance", "financial", "capital", "invest", "wealth", "bank", "insurance", "credit"] },
  { industry: "Education",      keywords: ["school", "college", "academy", "institute", "training", "educat"] },
  { industry: "Retail",         keywords: ["retail", "shop", "store", "mart", "trading", "traders", "wholesale", "distribution"] },
  { industry: "Hospitality",    keywords: ["hotel", "resort", "restaurant", "catering", "food", "hospitality"] },
  { industry: "Logistics",      keywords: ["logistics", "transport", "cargo", "freight", "courier", "shipping", "supply chain"] },
  { industry: "Agriculture",    keywords: ["agro", "agri", "farm", "seeds", "fertilizer", "crop"] },
]

/**
 * Infers an industry string from a company name using keyword matching.
 * Returns null if no confident match.
 */
export function inferIndustry(companyName: string | null | undefined): string | null {
  if (!companyName) return null
  const name = companyName.toLowerCase()
  for (const { industry, keywords } of INDUSTRY_KEYWORDS) {
    if (keywords.some((kw) => name.includes(kw))) return industry
  }
  return null
}
