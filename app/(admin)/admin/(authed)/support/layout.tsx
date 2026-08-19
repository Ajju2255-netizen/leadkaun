// support/page.tsx is a client component (debounced search box), so it cannot
// export `metadata` itself. A sibling layout is the standard way to title it.
export const metadata = { title: "Support" }

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
