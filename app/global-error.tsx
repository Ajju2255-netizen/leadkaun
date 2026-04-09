"use client"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", margin: 0, backgroundColor: "#fafafa" }}>
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: "400px" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>Something went wrong</h1>
          <p style={{ color: "#71717a", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
            {error.digest ? `Error ID: ${error.digest}` : "An unexpected error occurred."}
          </p>
          <button
            onClick={reset}
            style={{ padding: "0.5rem 1.5rem", borderRadius: "6px", border: "1px solid #e4e4e7", background: "#fff", cursor: "pointer", fontSize: "0.9rem" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
