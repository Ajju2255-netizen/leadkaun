import { NextResponse } from "next/server"
import { createServerClient, type CookieOptions } from "@supabase/auth-helpers-nextjs"

import { registerAccount } from "@/lib/auth/register-account"

/**
 * Signup submitted straight from the marketing site.
 *
 * The marketing signup form used to collect a name, an email and a company,
 * then bounce the visitor to /register to fill a second form. Two forms on the
 * highest intent path in the funnel is a drop off point, so the marketing form
 * now asks for everything and posts here, and the visitor lands inside the
 * product already signed in.
 *
 * It is a plain HTML form POST, deliberately, and that choice is what makes the
 * session work. The submission is a TOP LEVEL NAVIGATION to app.leadkaun.com,
 * so this response is first party for that host and its Set-Cookie is accepted
 * everywhere, Safari included. A fetch() from leadkaun.com would be a cross
 * site request whose auth cookie ITP drops on the floor, which is the reason
 * the old design punted to a redirect in the first place.
 *
 * The password is posted directly from the browser to this host. It is never
 * held in the marketing site's JavaScript and never reaches its server.
 *
 * The account itself is created by lib/auth/register-account.ts, the same
 * function the /register page's server action calls, so the two entry points
 * cannot drift.
 */

const ALLOWED_ORIGINS = [
  "https://leadkaun.com",
  "https://www.leadkaun.com",
  "https://app.leadkaun.com",
]

function isAllowedOrigin(value: string | null): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    if (ALLOWED_ORIGINS.includes(url.origin)) return true
    // Local development across the two dev servers, either spelling of home.
    return process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname)
  } catch {
    return false
  }
}

/** Where to send someone whose submission we refused, with the reason shown. */
function backToForm(referer: string | null, message: string): string {
  const fallback = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/register`
  if (!isAllowedOrigin(referer)) return fallback
  try {
    const url = new URL(referer!)
    url.searchParams.set("signup_error", message)
    url.hash = "signup"
    return url.toString()
  } catch {
    return fallback
  }
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin")
  const referer = req.headers.get("referer")

  // A form POST always carries Origin. Anything else is not our form.
  if (!isAllowedOrigin(origin)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 })
  }

  let fields: FormData
  try {
    fields = await req.formData()
  } catch {
    return NextResponse.json({ error: "Expected a form submission" }, { status: 400 })
  }

  const read = (k: string) => String(fields.get(k) ?? "").trim()
  const input = {
    orgName:   read("orgName"),
    firstName: read("firstName"),
    lastName:  read("lastName"),
    email:     read("email").toLowerCase(),
    phone:     read("phone").replace(/\D/g, "").slice(0, 10),
    password:  String(fields.get("password") ?? ""),
  }

  // Cheap shape checks before touching Supabase or the database. The browser
  // enforces these too, but a form POST is trivially replayable without one.
  const missing = (["orgName", "firstName", "lastName", "email", "password"] as const)
    .filter((k) => !input[k])
  if (missing.length) {
    return NextResponse.redirect(backToForm(referer, "Please fill in every field."), 303)
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
    return NextResponse.redirect(backToForm(referer, "That email address does not look right."), 303)
  }
  if (input.password.length < 8) {
    return NextResponse.redirect(backToForm(referer, "Your password needs at least 8 characters."), 303)
  }

  let result
  try {
    result = await registerAccount(input)
  } catch (err) {
    console.error("[signup] registerAccount threw:", err)
    return NextResponse.redirect(backToForm(referer, "Something went wrong on our side. Please try again."), 303)
  }

  if (!result.success) {
    return NextResponse.redirect(backToForm(referer, result.error), 303)
  }

  /**
   * Sign in onto the redirect response itself rather than through next/headers.
   * The cookie adapter writes to the exact response the browser is about to
   * follow, which is the same pattern middleware.ts uses and leaves no question
   * about whether the Set-Cookie survived.
   *
   * `signup=1` tells the onboarding page to fire the conversion events that the
   * /register path fires from the browser, so a signup counts once wherever it
   * came from.
   */
  const destination = new URL(result.redirectTo, `${new URL(req.url).origin}`)
  destination.searchParams.set("signup", "1")
  const response = NextResponse.redirect(destination, 303)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          const match = req.headers.get("cookie")?.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
          return match ? decodeURIComponent(match[1]) : undefined
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options })
        },
      },
    }
  )

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email:    input.email,
    password: input.password,
  })

  if (signInError) {
    // The account exists, so this is not a signup failure. Send them to sign in
    // rather than back to a form that would now reject the email as taken.
    console.error("[signup] auto sign-in failed:", signInError.message)
    const login = new URL("/login", new URL(req.url).origin)
    login.searchParams.set("notice", "Your account is ready. Please sign in.")
    return NextResponse.redirect(login, 303)
  }

  return response
}
