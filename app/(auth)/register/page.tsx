"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { registerAction } from "./actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export default function RegisterPage() {
  const router = useRouter()

  const [form, setForm] = useState({
    orgName: "",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // 1. Create account + user via server action
    const result = await registerAction(form)

    if (!result.success) {
      setError(result.error)
      setLoading(false)
      return
    }

    // 2. Sign in immediately after registration
    const supabase = getSupabaseBrowserClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })

    if (signInError) {
      setError("Account created but sign-in failed. Please go to login.")
      setLoading(false)
      return
    }

    router.push(result.redirectTo)
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <div className="text-center mb-2">
            <span className="text-2xl font-bold tracking-tight">Leadkaun</span>
          </div>
          <CardTitle className="text-xl">Create your account</CardTitle>
          <CardDescription>Get your team started in under 8 minutes</CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organisation name</Label>
              <Input
                id="orgName"
                name="orgName"
                placeholder="Acme Real Estate"
                value={form.orgName}
                onChange={handleChange}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  placeholder="Arjun"
                  value={form.firstName}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  placeholder="Sharma"
                  value={form.lastName}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="arjun@acmerealty.in"
                autoComplete="email"
                value={form.email}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                minLength={8}
                value={form.password}
                onChange={handleChange}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account…" : "Create account"}
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              Already have an account?{" "}
              <Link href="/login" className="text-foreground underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
