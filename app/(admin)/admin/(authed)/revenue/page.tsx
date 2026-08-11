import { redirect } from "next/navigation"

// Renamed Revenue → Billing when Usage was added alongside it.
export default function LegacyRevenueRedirect() {
  redirect("/admin/billing")
}
