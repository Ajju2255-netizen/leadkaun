// login/page.tsx is a client component (Supabase signInWithPassword), so it
// cannot export `metadata` itself. A sibling layout is the standard way.
export const metadata = { title: "Sign in" }

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
