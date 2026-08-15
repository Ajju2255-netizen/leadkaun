import { MetaPixel } from "@/components/analytics/MetaPixel"

/**
 * Auth route group.
 *
 * Exists to scope the Meta Pixel to the signup funnel — register, login,
 * password reset — rather than loading a third-party tracker across the
 * signed-in product. The conversion (`CompleteRegistration`) happens on
 * /register, so this is the only place the pixel needs to be.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MetaPixel />
      {children}
    </>
  )
}
