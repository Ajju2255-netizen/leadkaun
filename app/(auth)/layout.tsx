/**
 * Auth route group.
 *
 * The Meta Pixel used to be mounted here to keep it off the signed-in product,
 * but a nested layout renders into <body> and Meta's detector only scans
 * <head>. It now lives in the root layout's <head>, with PageView gated at
 * runtime to these auth routes so the rest of the app still reports nothing.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
