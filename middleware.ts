import { createServerClient, type CookieOptions } from "@supabase/auth-helpers-nextjs"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

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
    if (!pathname.startsWith("/admin")) {
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
      await supabase.auth.getSession()
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

  // Refresh session (keeps cookie alive, must run on every request)
  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Unauthenticated user hitting a protected route → redirect to login
  if (!session && isDashboardPath(pathname)) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = "/login"
    loginUrl.searchParams.set("redirectTo", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated user hitting an auth page → go straight to execution
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
