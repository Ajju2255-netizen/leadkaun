import { createServerClient, type CookieOptions } from "@supabase/auth-helpers-nextjs"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

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

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

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

  const { pathname } = req.nextUrl

  // Unauthenticated user hitting a protected route → redirect to login
  if (!session && isDashboardPath(pathname)) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = "/login"
    loginUrl.searchParams.set("redirectTo", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated user hitting an auth page → redirect to dashboard
  if (session && isAuthPath(pathname)) {
    const dashboardUrl = req.nextUrl.clone()
    dashboardUrl.pathname = "/dashboard"
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
