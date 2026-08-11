import { redirect } from "next/navigation"

// The section was renamed Customers → Accounts. Old links (bookmarks, links in
// past tickets, the pre-rename timeline) must keep working.
export default function LegacyCustomersRedirect() {
  redirect("/admin/accounts")
}
