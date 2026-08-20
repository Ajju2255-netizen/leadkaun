import type { TourStep } from "@/lib/tour/types"

/**
 * The walkthrough, as data.
 *
 * Every major section gets a stop, which is what was asked for. Keeping the
 * steps as a plain list rather than wiring them into the pages means the
 * grouping can change later without touching the engine: a shorter core run
 * plus per section hints on first visit is the same array, read differently.
 *
 * Copy carries no dashes anywhere, by house rule.
 *
 * Adding a step means adding its `data-tour` attribute to the target element.
 * If an anchor ever goes missing the engine centres that step rather than
 * stalling, so a refactor elsewhere degrades the tour instead of breaking it.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    chapter: "Getting started",
    route: "/queue",
    title: "Let me show you around",
    body: "A couple of minutes, and you can leave at any point. Everything you are about to see is running on example leads, so nothing here can go wrong.",
  },
  {
    id: "workspace",
    chapter: "Getting started",
    route: "/queue",
    anchor: "nav.workspace",
    mobile: "center",
    title: "You are in the Sample workspace",
    body: "These 24 leads are examples, not yours. This control is how you switch to your own workspace, and it is where your real leads will live.",
    requiresSample: true,
  },
  {
    id: "queue",
    chapter: "Execute",
    route: "/queue",
    anchor: "queue.list",
    title: "The priority queue",
    body: "Leadkaun reads every lead and sorts them by who is worth calling first, so nobody starts the day guessing. This is the screen your reps live in.",
  },
  {
    id: "grades",
    chapter: "Execute",
    route: "/queue",
    anchor: "queue.grades",
    title: "Grades run A to F",
    body: "A grade combines fit, intent and data quality. Grade A means a strong match who is showing real interest. Work from the top down.",
  },
  {
    id: "followups",
    chapter: "Execute",
    route: "/follow-ups",
    anchor: "followups.list",
    title: "Follow ups that are due",
    body: "Scheduled from what you log, so a promise to call back on Thursday turns up on Thursday instead of living in someone's notebook.",
  },
  {
    id: "pipeline",
    chapter: "Execute",
    route: "/pipeline",
    anchor: "pipeline.board",
    title: "Your pipeline",
    body: "Drag a lead to move it forward. Stage changes feed straight back into scoring, so the queue reflects what actually happened today.",
  },
  {
    id: "leads",
    chapter: "Your data",
    route: "/leads",
    anchor: "leads.table",
    title: "Every lead you have",
    body: "The queue is the shortlist. This is the full list, searchable and filterable by grade, stage, source, rep and import batch.",
  },
  {
    /**
     * Points at the sidebar rather than walking to /leads/import, deliberately.
     * That page moves you out of the sample workspace on arrival, by design, so
     * visiting it mid tour would empty every screen after it. The tour stays in
     * the demo, where there is something to look at, and the last step takes
     * them to import for real once the walkthrough is done.
     */
    id: "import",
    chapter: "Your data",
    route: "/queue",
    anchor: "nav.import",
    mobile: "center",
    roles: ["ADMIN", "MANAGER"],
    title: "This is where your own leads come in",
    body: "Two columns are required, name and phone. Everything else is optional and makes the grading sharper, and there is a template you can fill in.",
  },
  {
    id: "dashboard",
    chapter: "Know what is working",
    route: "/dashboard",
    anchor: "dashboard.kpis",
    title: "Your numbers at a glance",
    body: "Speed to lead, conversion, and where deals are stalling. If one number is worth a daily look, it is on this screen.",
  },
  {
    id: "missed",
    chapter: "Know what is working",
    route: "/missed",
    anchor: "missed.list",
    roles: ["ADMIN", "MANAGER"],
    title: "Money going cold",
    body: "Leads that have sat too long for their grade, priced in rupees. For most teams this is the first number that pays for the software.",
  },
  {
    id: "analytics",
    chapter: "Know what is working",
    route: "/analytics",
    anchor: "analytics.body",
    roles: ["ADMIN", "MANAGER"],
    title: "Trends over time",
    body: "Where leads come from, which sources convert, and how that is moving. Useful once you have a few weeks of real activity.",
  },
  {
    id: "rep",
    chapter: "Know what is working",
    route: "/rep-tracking",
    anchor: "rep.body",
    roles: ["ADMIN", "MANAGER"],
    title: "How each rep is doing",
    body: "Calls made, follow ups kept, and what each person converted. Built to coach with, not to catch people out.",
  },
  {
    id: "learning",
    chapter: "Know what is working",
    route: "/learning",
    anchor: "learning.body",
    roles: ["ADMIN", "MANAGER"],
    title: "What Leadkaun has worked out",
    body: "Patterns it has found in your own closed deals, which is what keeps the scoring tuned to your business rather than a generic model.",
  },
  {
    id: "activity",
    chapter: "Know what is working",
    route: "/activity",
    anchor: "activity.body",
    title: "The full log",
    body: "Every call, message and stage change, in order. This is where you go when you need to know exactly what happened on a deal.",
  },
  {
    id: "notifications",
    chapter: "Know what is working",
    route: "/notifications",
    anchor: "notifications.body",
    title: "Alerts worth interrupting for",
    body: "A lead crossing your qualification threshold, a grade dropping, a follow up going overdue. Quiet by design.",
  },
  {
    id: "settings",
    chapter: "Make it yours",
    route: "/settings/icp",
    anchor: "settings.icp",
    roles: ["ADMIN", "MANAGER"],
    title: "This is what makes it yours",
    body: "Tell Leadkaun which industries, regions and deal sizes you actually sell to, and the fit half of every score follows. It is the one setting worth doing early.",
  },
  {
    id: "finish",
    chapter: "Make it yours",
    route: "/queue",
    title: "Now bring your own leads",
    body: "Everything you just saw was example data. Import the leads you already have and Leadkaun does the same thing with yours, the same day.",
  },
]
