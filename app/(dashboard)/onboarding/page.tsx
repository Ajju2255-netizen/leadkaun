import { redirect } from "next/navigation"

/**
 * The first run wizard is gone. Signing up is the first run.
 *
 * It asked for two things before anyone could see the product: bring your
 * leads, then set an ICP. The first was a detour to the import page and back,
 * the second was optional and skipped by most people, and together they stood
 * between signing up and seeing a single lead. Registration now lands straight
 * in the sample workspace, where the queue already has 24 graded leads in it,
 * and the tour explains the rest in place.
 *
 * This route stays as a redirect rather than being deleted, because links to it
 * outlive it: old bookmarks, the import page's return path, anything pasted
 * into a support thread. They land in the queue instead of a 404.
 *
 * What the wizard used to collect is still reachable. The ICP lives at
 * /settings/icp and the tour has a step pointing at it, and importing is a
 * click away in the sidebar.
 */
export default function OnboardingRedirect() {
  redirect("/queue")
}
