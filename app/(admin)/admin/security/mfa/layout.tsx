// security/mfa/page.tsx is a client component (Supabase TOTP enrol/challenge),
// so it cannot export `metadata` itself. A sibling layout is the standard way.
export const metadata = { title: "Two-factor authentication" }

export default function AdminMfaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
