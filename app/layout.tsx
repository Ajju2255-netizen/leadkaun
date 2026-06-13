import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"
import { QueryProvider } from "@/components/providers/QueryProvider"
import { Toaster } from "@/components/ui/sonner"

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
})
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
})

export const metadata: Metadata = {
  title: "Leadkaun — Sales Behaviour OS",
  description: "India's first sales behaviour operating system",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <QueryProvider>{children}</QueryProvider>
        {/* sonner toast renderer — was never mounted, so every toast() in the
            app (settings saves, errors, realtime alerts) silently did nothing. */}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
