import { describe, it, expect } from "vitest"
import { analyseIntake } from "../analyse"

// Keys are already column-mapped (as the client sends them post-mapHeader).

// A clean B2B manufacturing export: company + designation + GSTIN + valid phones.
// One duplicate phone (rows 1 & 10) to exercise the duplicate estimate.
const B2B = [
  { first_name: "Rajesh Kumar",  phone: "98765 43210",     email: "rajesh@shaktiind.com",  company_name: "Shakti Industries",   designation: "Purchase Manager", city: "Ahmedabad", state: "Gujarat",     expected_value: "500000", gstin: "24AAECS1234F1Z5" },
  { first_name: "Anand Shah",    phone: "+91 99887 76655", email: "anand@precisionworks.in", company_name: "Precision Works",    designation: "Owner",           city: "Surat",     state: "Gujarat",     expected_value: "250000", gstin: "24AAECP5678G1Z2" },
  { first_name: "Meena Iyer",    phone: "9812345678",      email: "meena@metrofab.com",     company_name: "Metro Fabrication",  designation: "Director",        city: "Pune",      state: "Maharashtra", expected_value: "1200000", gstin: "27AAECM9012H1Z8" },
  { first_name: "Vikram Singh",  phone: "9898989898",      email: "vikram@anandsteel.in",   company_name: "Anand Steel Works",  designation: "GM",              city: "Rajkot",    state: "Gujarat",     expected_value: "800000", gstin: "24AAECA3456J1Z1" },
  { first_name: "Sunil Patel",   phone: "9765432109",      email: "sunil@gujaratforge.com", company_name: "Gujarat Forge",      designation: "Proprietor",      city: "Vadodara",  state: "Gujarat",     expected_value: "300000", gstin: "24AAECG7890K1Z4" },
  { first_name: "Deepa Nair",    phone: "9700011122",      email: "deepa@reliablecast.in",  company_name: "Reliable Castings",  designation: "Buyer",           city: "Nashik",    state: "Maharashtra", expected_value: "450000", gstin: "27AAECR2345L1Z9" },
  { first_name: "Amit Verma",    phone: "9633322110",      email: "amit@sharmamills.com",   company_name: "Sharma Mills",       designation: "Manager",         city: "Indore",    state: "MP",          expected_value: "150000", gstin: "23AAECS6789M1Z3" },
  { first_name: "Kavita Rao",    phone: "9945566778",      email: "kavita@nationalind.in",  company_name: "National Industries", designation: "VP Ops",         city: "Nagpur",    state: "Maharashtra", expected_value: "950000", gstin: "27AAECN0123N1Z7" },
  { first_name: "Farhan Ali",    phone: "9876501234",      email: "farhan@apexmfg.com",     company_name: "Apex Manufacturing", designation: "Head - Procurement", city: "Bhopal", state: "MP",         expected_value: "600000", gstin: "23AAECA4567P1Z0" },
  { first_name: "Rajesh Kumar",  phone: "98765 43210",     email: "rajesh@shaktiind.com",   company_name: "Shakti Industries",  designation: "Purchase Manager", city: "Ahmedabad", state: "Gujarat",    expected_value: "500000", gstin: "24AAECS1234F1Z5" },
]

// A thin B2C consumer list: name + phone + city only.
const B2C = [
  { first_name: "Pooja",   phone: "9876000011", city: "Mumbai" },
  { first_name: "Arjun",   phone: "9876000022", city: "Delhi" },
  { first_name: "Sneha",   phone: "9876000033", city: "Bangalore" },
  { first_name: "Rohit",   phone: "9876000044", city: "Hyderabad" },
  { first_name: "Divya",   phone: "9876000055", city: "Chennai" },
  { first_name: "Karan",   phone: "9876000066", city: "Pune" },
  { first_name: "Neha",    phone: "9876000077", city: "Kolkata" },
  { first_name: "Sameer",  phone: "9876000088", city: "Mumbai" },
  { first_name: "Aditi",   phone: "9876000099", city: "Delhi" },
  { first_name: "Manish",  phone: "9876000100", city: "Jaipur" },
]

describe("analyseIntake", () => {
  it("profiles a clean B2B manufacturing export as ready", () => {
    const report = analyseIntake({ sample: B2B, totalRows: 14286 })
    // eslint-disable-next-line no-console
    console.log("\n=== B2B MANUFACTURING (14,286 leads) ===\n" + JSON.stringify(report, null, 2))

    expect(report.leadType.known).toBe(true)
    expect(report.leadType.claim).toContain("B2B")
    expect(report.businessType.known).toBe(true)
    expect(report.businessType.claim).toContain("Manufacturing")
    expect(report.country.known).toBe(true)
    expect(report.confidence.band).toBe("ready")
    expect(report.readiness.label).toBe("High")
    expect(report.duplicateEstimate.pct).toBeGreaterThan(0) // one repeated phone
    expect(report.dataReadiness.find((d) => d.area === "Phone numbers")?.rating).toBe("Excellent")
    expect(report.closingLine).toMatch(/help from day one/)
  })

  it("profiles a thin B2C list honestly (unknown industry, review band)", () => {
    const report = analyseIntake({ sample: B2C, totalRows: 5000 })
    // eslint-disable-next-line no-console
    console.log("\n=== B2C CONSUMER (5,000 leads) ===\n" + JSON.stringify(report, null, 2))

    expect(report.leadType.known).toBe(true)
    expect(report.leadType.claim).toContain("B2C")
    expect(report.businessType.known).toBe(false) // no company data → honest unknown
    expect(report.missingFields).toContain("Company")
    expect(report.missingFields).toContain("Industry")
    expect(["review", "low"]).toContain(report.confidence.band)
    expect(["Medium", "Low"]).toContain(report.readiness.label)
  })
})
