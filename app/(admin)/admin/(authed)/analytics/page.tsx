import { redirect } from "next/navigation"

// Product Analytics was split when Growth got its own section: the acquisition
// funnel and feature adoption now live on Growth → Activation, attribution on
// Growth → Acquisition, and the live activity feed on the Overview.
export default function LegacyAnalyticsRedirect() {
  redirect("/admin/growth/activation")
}
