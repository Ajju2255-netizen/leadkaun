"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { LeadkaunMark } from "@/components/shared/LeadkaunMark"
import { Target, ListChecks, AlertCircle, Eye, EyeOff } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { trackCompleteRegistration, sendCompleteRegistrationServerSide } from "@/lib/analytics/meta-pixel"
import { trackSignUp } from "@/lib/analytics/ga4"
import { registerAction } from "./actions"

/**
 * Field styling.
 *
 * 16px on phones is load bearing, not a taste call: iOS Safari zooms the whole
 * viewport when a focused input is under 16px, which on the old 13px fields
 * threw the layout sideways on every tap. It steps down to 14px from sm up,
 * where no such rule applies. Height follows the same logic, 48px of touch
 * target on a phone against 44px on a pointer device.
 */
const inputCls =
  "w-full h-12 sm:h-11 px-3.5 rounded-xl glass-1 gloss-edge border border-white/70 " +
  "text-[16px] sm:text-[14px] text-ink placeholder:text-ink-faint outline-none " +
  "focus:border-sky-400 focus:[background:rgba(255,255,255,0.92)] transition-all"

const labelCls = "text-[12px] font-semibold text-ink-soft block"

const BENEFITS = [
  { Icon: Target,      text: "Every lead graded A to F on fit, intent and quality" },
  { Icon: ListChecks,  text: "A priority queue that tells reps who to call next" },
  { Icon: AlertCircle, text: "Catch missed opportunities before they go cold" },
]

type FormKey = "orgName" | "firstName" | "lastName" | "email" | "phone" | "password"

/**
 * Subcomponents live at module scope on purpose. Declared inside RegisterPage
 * they would be a new component type on every keystroke, so React would unmount
 * and remount each input and the field would lose focus after one character.
 */
function TextField({
  name, label, value, onChange, ...rest
}: {
  name: FormKey
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "value" | "onChange">) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className={labelCls}>{label}</label>
      <input id={name} name={name} required value={value} onChange={onChange} className={inputCls} {...rest} />
    </div>
  )
}

function PhoneField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="phone" className={labelCls}>Mobile number</label>
      <div className="flex items-center gap-2">
        {/* India first: the country code is a fixed affix rather than one more
            thing to pick on a phone keyboard. */}
        <span className="inline-flex h-12 shrink-0 items-center rounded-xl glass-1 gloss-edge border border-white/70 px-3 text-[15px] text-ink-soft sm:h-11 sm:text-[14px]">
          +91
        </span>
        <input
          id="phone" name="phone" required
          type="tel" inputMode="numeric" autoComplete="tel-national"
          pattern="[0-9]{10}" maxLength={10}
          placeholder="98765 43210"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
          className={inputCls}
        />
      </div>
      <p className="text-[11px] text-ink-faint">So we can reach you about your account. We never call to sell.</p>
    </div>
  )
}

function PasswordField({
  value, onChange, show, onToggle,
}: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  show: boolean
  onToggle: () => void
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="password" className={labelCls}>Password</label>
      <div className="relative">
        <input
          id="password" name="password" required
          type={show ? "text" : "password"}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          minLength={8}
          value={value} onChange={onChange}
          className={`${inputCls} pr-11`}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "Hide password" : "Show password"}
          tabIndex={-1}
          className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-ink-faint transition-colors hover:text-ink-soft"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  const router = useRouter()

  const [form, setForm] = useState({
    orgName:   "",
    firstName: "",
    lastName:  "",
    email:     "",
    phone:     "",
    password:  "",
  })
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const result = await registerAction(form)

      if (!result.success) {
        setError(result.error)
        setLoading(false)
        return
      }

      // The account exists from here on, so this is the real "registration
      // completed" moment. Fired before the auto sign-in deliberately: if that
      // step fails the registration still happened, and Meta should still be told.
      //
      // Sent twice, sharing one id so Meta deduplicates: the browser pixel (which
      // ad blockers stop for a meaningful share of users) and a server-side copy
      // via our own domain, which they do not touch. Neither can throw.
      const eventId = crypto.randomUUID()
      trackCompleteRegistration(eventId)
      sendCompleteRegistrationServerSide({ eventId, email: form.email })

      // GA4's own recommended `sign_up` event. Separate vendor, separate schema,
      // and it is what makes signups answerable by default channel grouping,
      // i.e. "how many of these came from organic search". Carries no PII.
      trackSignUp("email")

      const supabase = getSupabaseBrowserClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email:    form.email,
        password: form.password,
      })

      if (signInError) {
        setError("Your account was created but sign in failed. Please use the sign in page.")
        setLoading(false)
        return
      }

      router.push(result.redirectTo)
      router.refresh()
    } catch (err) {
      /**
       * A rejected server action used to land here as nothing at all. The await
       * threw, no state was ever set, and Next recovered by remounting the
       * route, which cleared the form and left the visitor back on an apparently
       * untouched signup page with no idea whether an account had been made. The
       * commonest trigger is deploy skew: a tab opened before a deploy posts an
       * action id the new build no longer serves. Say so instead of vanishing.
       */
      console.error("Register failed:", err)
      setError("Something went wrong on our side. Please reload the page and try again.")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden">

      {/* Mesh background */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 12% 18%, rgba(125,211,252,0.55), transparent 70%), " +
            "radial-gradient(ellipse 65% 55% at 82% 88%, rgba(253,186,116,0.50), transparent 72%), " +
            "radial-gradient(ellipse 45% 40% at 88% 50%, rgba(34,211,238,0.30), transparent 70%), " +
            "var(--bg-pure)",
        }}
        aria-hidden
      />
      <div className="blob blob-lg blob-sky -top-32 -left-40 absolute" aria-hidden />
      <div className="blob blob-lg blob-peach -bottom-32 -right-32 absolute" style={{ animationDelay: "3s" }} aria-hidden />

      {/*
        The page is a centred, width capped rail rather than two halves of the
        viewport. Splitting on `w-1/2` meant that on a wide monitor the copy and
        the card were flung to opposite edges with a void between them, which is
        what made this screen look broken rather than merely plain.
      */}
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1080px] flex-col justify-center gap-10 px-4 py-10 sm:px-6 lg:flex-row lg:items-center lg:gap-16 lg:py-16">

        {/* Value panel, pointer sized screens only. */}
        <section className="hidden lg:flex lg:w-[45%] lg:flex-col">
          {/* self-start matters: the mark is an <img> sized by height with an
              auto width, and a flex column stretches an auto width child to the
              full column. That is what smeared it into a coloured streak. */}
          <LeadkaunMark size={44} gloss className="self-start" />
          <p className="mt-8 text-[36px] font-extrabold leading-[1.14] tracking-tight text-ink">
            Know who to call next, every morning.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
            Leadkaun scores every lead on fit, intent and quality, then ranks your day so reps
            stop guessing and start closing.
          </p>
          <ul className="mt-8 space-y-3.5">
            {BENEFITS.map(({ Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-100">
                  <Icon className="h-4 w-4 text-sky-600" strokeWidth={2.2} />
                </span>
                <span className="pt-1 text-[14px] leading-snug text-ink-soft">{text}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Form column */}
        <div className="mx-auto w-full max-w-[440px] lg:mx-0 lg:w-[55%]">

          <div className="mb-6 flex flex-col items-center gap-3 lg:mb-5 lg:items-start lg:gap-0">
            <LeadkaunMark size={40} gloss className="self-center lg:hidden" />
            <div className="text-center lg:text-left">
              <h1 className="text-[22px] font-bold tracking-[-0.025em] text-ink lg:text-[20px]">
                Create your workspace
              </h1>
              <p className="mt-1 text-[13px] text-ink-muted">
                Free to start. You can invite your reps once you are in.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="glass-3 gloss-edge space-y-4 rounded-2xl p-5 sm:p-7">

            <TextField
              name="orgName" label="Organisation name" autoComplete="organization"
              placeholder="Acme Real Estate"
              value={form.orgName} onChange={handleChange}
            />

            {/* On the narrowest phone each still gets about 138px, which holds
                a first name. */}
            <div className="grid grid-cols-2 gap-3">
              <TextField
                name="firstName" label="First name" autoComplete="given-name"
                placeholder="Arjun" value={form.firstName} onChange={handleChange}
              />
              <TextField
                name="lastName" label="Last name" autoComplete="family-name"
                placeholder="Sharma" value={form.lastName} onChange={handleChange}
              />
            </div>

            <TextField
              name="email" label="Work email" type="email"
              autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false}
              placeholder="arjun@acmerealty.in"
              value={form.email} onChange={handleChange}
            />

            <PhoneField value={form.phone} onChange={(v) => setForm((prev) => ({ ...prev, phone: v }))} />

            <PasswordField
              value={form.password}
              onChange={handleChange}
              show={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
            />

            {error && (
              <p
                role="alert"
                className="rounded-xl px-3 py-2 text-[12.5px] text-red-700"
                style={{
                  background: "rgba(254, 226, 226, 0.85)",
                  border: "1px solid rgba(252, 165, 165, 0.45)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary shimmer-on-hover mt-1 h-12 w-full text-[14px] disabled:cursor-not-allowed disabled:opacity-60 sm:h-11"
            >
              <span className="relative z-[2]">{loading ? "Creating account…" : "Create free account"}</span>
            </button>
          </form>

          <p className="mt-6 text-center text-[12.5px] text-ink-muted lg:text-left">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-sky-600 underline-offset-4 transition-colors hover:text-sky-500 hover:underline">
              Sign in
            </Link>
          </p>

        </div>
      </div>
    </div>
  )
}
