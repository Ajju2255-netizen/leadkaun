import { createServerClient, type CookieOptions } from "@supabase/auth-helpers-nextjs"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { RECOVERY_COOKIE, RECOVERY_PATH, recoveryCookieOptions } from "@/lib/auth/recovery"

// Dev-only auth bypass — see lib/auth/session.ts. Hard-guarded by NODE_ENV.
const DEV_BYPASS =
  process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "true"

const DASHBOARD_PATHS = [
  "/dashboard",
  "/leads",
  "/pipeline",
  "/queue",
  "/analytics",
  "/missed",
  "/settings",
  "/onboarding",
]
const AUTH_PATHS = ["/login", "/register"]

function isDashboardPath(pathname: string) {
  return DASHBOARD_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

function isAuthPath(pathname: string) {
  return AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

const ADMIN_HOST_PREFIX = "admin."

// Sections renamed after launch. Old links — bookmarks, links pasted into past
// tickets, pre-rename timeline entries — must keep working. Prefix entries also
// carry their detail paths across (/customers/<id> → /accounts/<id>).
const ADMIN_LEGACY_PATHS: { from: string; to: string; prefix?: boolean }[] = [
  { from: "/customers", to: "/accounts", prefix: true }, // renamed Customers → Accounts
  { from: "/revenue",   to: "/billing" },                // renamed when Usage was added alongside
  { from: "/analytics", to: "/growth/activation" },      // split into Growth when that section landed
]

function legacyAdminPath(pathname: string): string | null {
  for (const { from, to, prefix } of ADMIN_LEGACY_PATHS) {
    if (pathname === from) return to
    if (prefix && pathname.startsWith(from + "/")) return to + pathname.slice(from.length)
  }
  return null
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  // ── Platform admin (admin.leadkaun.com) — a fully separate surface ─────────
  // The admin panel lives in the app/(admin) route group, reachable ONLY via the
  // admin.* host. We keep the URL space distinct by mapping the admin host onto
  // an internal /admin/* path the (admin) group owns, and we hard-block the
  // /admin/* path on the customer (app.*) host so the two never overlap.
  const host = req.headers.get("host") ?? ""
  const isAdminHost = host.startsWith(ADMIN_HOST_PREFIX)
  const { pathname } = req.nextUrl

  if (isAdminHost) {
    // Admin host: map clean URLs (admin.leadkaun.com/customers) onto the
    // (admin) route group, which physically lives under /admin/*. API routes
    // (/api/*) are excluded from the matcher and self-guard, so they pass through
    // untouched. Auth is enforced per-page + per-API, never here.
    let response = res

    // Renamed sections. These lived as redirect-only page.tsx shims, but a
    // server-side redirect() resolves against the route tree rather than the
    // public URL space, so it could only ever point at the internal /admin/*
    // form — which now costs a second hop. Middleware runs before routing and
    // gets there in one.
    const legacy = legacyAdminPath(pathname)
    if (legacy) {
      const url = req.nextUrl.clone()
      url.pathname = legacy
      return NextResponse.redirect(url)
    }

    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      // The internal path leaking into the address bar gave every page two live
      // URLs (/accounts and /admin/accounts both served 200). Collapse onto the
      // clean one — this also keeps AdminNav's active-state normalisation and
      // any bookmark of the old shape working.
      const url = req.nextUrl.clone()
      url.pathname = pathname.slice("/admin".length) || "/"
      return NextResponse.redirect(url)
    }
    {
      const url = req.nextUrl.clone()
      url.pathname = pathname === "/" ? "/admin" : `/admin${pathname}`
      response = NextResponse.rewrite(url)
    }
    // Keep the Supabase session alive on the admin host too (must run on every
    // request, exactly like the customer host below) so admin logins don't drop
    // when the access token expires. No redirect logic here — pages self-gate.
    if (!DEV_BYPASS) {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get(name: string) { return req.cookies.get(name)?.value },
            set(name: string, value: string, options: CookieOptions) {
              req.cookies.set({ name, value, ...options })
              response.cookies.set({ name, value, ...options })
            },
            remove(name: string, options: CookieOptions) {
              req.cookies.set({ name, value: "", ...options })
              response.cookies.set({ name, value: "", ...options })
            },
          },
        }
      )
      // A stale or revoked refresh token makes getSession throw (AuthApiError:
      // Invalid Refresh Token). That must never 500 the request — admin pages
      // self-gate, so swallow it and let the response through as signed-out.
      try {
        await supabase.auth.getSession()
      } catch {
        // treated as signed out
      }
    }
    return response
  }

  // Customer host must never expose the admin surface.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return new NextResponse("Not found", { status: 404 })
  }

  // Dev bypass: let everything through; rewrite auth-page visits to /queue
  // so the local preview matches the post-login behaviour.
  if (DEV_BYPASS) {
    if (isAuthPath(pathname)) {
      const url = req.nextUrl.clone()
      url.pathname = "/queue"
      url.search = ""
      return NextResponse.redirect(url)
    }
    return res
  }

  // createServerClient in middleware context — reads/writes cookies on req/res
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          req.cookies.set({ name, value, ...options })
          res.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          req.cookies.set({ name, value: "", ...options })
          res.cookies.set({ name, value: "", ...options })
        },
      },
    }
  )

  // Refresh session (keeps cookie alive, must run on every request). A stale or
  // revoked refresh token makes getSession throw (AuthApiError: Invalid Refresh
  // Token) — that must not 500 the page. Treat any failure as "no session"; the
  // redirect below sends them to /login, where a fresh sign-in overwrites the
  // bad cookies.
  let session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] = null
  try {
    const { data } = await supabase.auth.getSession()
    session = data.session
  } catch {
    session = null
  }

  // Unauthenticated user hitting a protected route → redirect to login
  if (!session && isDashboardPath(pathname)) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = "/login"
    loginUrl.searchParams.set("redirectTo", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated user hitting an auth page → go straight to execution
  /**
   * Password-recovery gate.
   *
   * A recovery link signs the user in because Supabase requires a session to
   * change a password. This confines that session to /set-password so the
   * emailed link cannot be used as a standing login.
   *
   * Three conditions keep this loop-free, and all three are load-bearing:
   *
   *   1. `session &&` — a stale cookie with no session must NOT redirect.
   *      /set-password bounces a sessionless visitor to /login, so gating
   *      without this check gives /login → /set-password → /login forever.
   *      The cookie is cleared instead.
   *   2. /set-password is exempt, so the destination never re-redirects.
   *   3. The cookie is cleared by /api/auth/password-set in the same request
   *      that redirects into the app — never by a separate call that could
   *      succeed at redirecting and fail at clearing.
   *
   * API routes cannot deadlock either: the matcher below excludes them, so
   * signing out remains reachable at any point.
   */
  const recovering = req.cookies.get(RECOVERY_COOKIE)?.value === "1"

  if (recovering && !session) {
    res.cookies.set(RECOVERY_COOKIE, "", { ...recoveryCookieOptions, maxAge: 0 })
    return res
  }

  if (recovering && session && pathname !== RECOVERY_PATH) {
    const url = req.nextUrl.clone()
    url.pathname = RECOVERY_PATH
    url.search = ""
    const out = NextResponse.redirect(url)
    /**
     * Carry over anything Supabase wrote to `res` while reading the session.
     * This gate runs on every request during a reset, so it is the most likely
     * place to catch a token rotation — and a dropped refresh cookie would log
     * the user out mid-reset and bounce them to /login holding a valid link.
     */
    for (const c of res.cookies.getAll()) out.cookies.set(c)
    return out
  }

  if (session && isAuthPath(pathname)) {
    const dashboardUrl = req.nextUrl.clone()
    dashboardUrl.pathname = "/queue"
    dashboardUrl.search = ""
    return NextResponse.redirect(dashboardUrl)
  }

  return res
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
}
