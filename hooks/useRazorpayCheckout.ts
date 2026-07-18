"use client"

import { useCallback } from "react"

/**
 * Loads Razorpay Checkout on demand and opens it for a subscription.
 *
 * The script is injected lazily rather than in the root layout — only the
 * billing page ever needs it, and it's ~90KB of third-party JS we don't want on
 * every dashboard route.
 */

export type CheckoutSuccess = {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}

type OpenArgs = {
  keyId: string
  subscriptionId: string
  planName: string
  accountName: string
  email: string
  onSuccess: (payload: CheckoutSuccess) => void | Promise<void>
  onDismiss?: () => void
}

type RazorpayInstance = { open: () => void }
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance

declare global {
  interface Window {
    Razorpay?: RazorpayCtor
  }
}

const SRC = "https://checkout.razorpay.com/v1/checkout.js"

function loadScript(): Promise<RazorpayCtor> {
  if (typeof window === "undefined") return Promise.reject(new Error("not in a browser"))
  if (window.Razorpay) return Promise.resolve(window.Razorpay)

  return new Promise((resolve, reject) => {
    // A previous call may already have the tag in flight.
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`)
    const script = existing ?? document.createElement("script")

    let timeout: ReturnType<typeof setTimeout>
    const cleanup = () => {
      clearTimeout(timeout)
      script.removeEventListener("load", onLoad)
      script.removeEventListener("error", onError)
    }
    function onLoad() {
      cleanup()
      if (window.Razorpay) resolve(window.Razorpay)
      else { script.remove(); reject(new Error("Razorpay Checkout loaded but exposed no global")) }
    }
    function onError() {
      cleanup()
      // Remove the failed tag so a retry starts fresh — otherwise a later call
      // finds this dead tag, attaches a load listener that never fires, and the
      // checkout button stays stuck on "Opening…" forever.
      script.remove()
      reject(new Error("Failed to load Razorpay Checkout"))
    }
    // Backstop: never leave the caller hanging (which would keep the billing
    // button disabled) if a stale/blocked tag emits neither load nor error.
    timeout = setTimeout(() => { cleanup(); script.remove(); reject(new Error("Razorpay Checkout timed out")) }, 15000)

    script.addEventListener("load", onLoad)
    script.addEventListener("error", onError)

    if (!existing) {
      script.src = SRC
      script.async = true
      document.body.appendChild(script)
    }
  })
}

export function useRazorpayCheckout() {
  return useCallback(async (args: OpenArgs) => {
    const Razorpay = await loadScript()

    const rzp = new Razorpay({
      key: args.keyId,
      // `subscription_id` (not `order_id`) puts Checkout in mandate mode, so the
      // customer authorises recurring charges rather than paying once.
      subscription_id: args.subscriptionId,
      name: "Leadkaun",
      description: `${args.planName} — monthly`,
      prefill: { email: args.email, name: args.accountName },
      theme: { color: "#0ea5e9" },
      // Card-only for launch. Hiding UPI keeps our own UPI handle off the
      // checkout screen (a founder-branding concern) and matches how Anthropic /
      // OpenAI collect payment. UPI Autopay / net-banking e-mandate can be
      // re-enabled here once business registration + branding are ready.
      // (International cards also require enabling International on the Razorpay
      // account; this only controls which method blocks Checkout offers.)
      method: {
        card: true,
        upi: false,
        netbanking: false,
        wallet: false,
        emi: false,
        paylater: false,
      },
      handler: (response: CheckoutSuccess) => {
        void args.onSuccess(response)
      },
      modal: {
        ondismiss: () => args.onDismiss?.(),
      },
    })

    rzp.open()
  }, [])
}
