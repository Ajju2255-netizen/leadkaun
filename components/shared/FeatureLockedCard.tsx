import Link from "next/link"
import { Lock, ArrowRight } from "lucide-react"

/**
 * Shown when an API returns 403 FEATURE_LOCKED — a plan-gated feature the
 * account can't access yet. This is NOT an error state: it's a calm upgrade
 * prompt, so a gated feature never reads as "something broke, please refresh".
 */
export function FeatureLockedCard({
  feature,
  requiredTier,
  description,
}: {
  feature: string
  requiredTier: string
  description?: string
}) {
  return (
    <div className="max-w-lg mx-auto mt-6 glass-2 gloss-edge rounded-2xl px-6 py-10 text-center">
      <div
        className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-5"
        style={{ background: "linear-gradient(180deg, #DDD6FE 0%, #C4B5FD 100%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85)" }}
      >
        <Lock className="w-6 h-6 text-violet-700" strokeWidth={2} />
      </div>
      <h2 className="text-[18px] font-bold text-ink">{feature} is a {requiredTier} feature</h2>
      <p className="text-[13px] text-ink-soft mt-2 max-w-[42ch] mx-auto leading-relaxed">
        {description ?? `Upgrade to the ${requiredTier} plan to unlock ${feature.toLowerCase()}.`}
      </p>
      <Link
        href="/settings/billing"
        className="inline-flex items-center gap-2 mt-6 h-10 px-5 rounded-xl text-[13px] font-semibold text-white transition-all active:scale-[0.98]"
        style={{ background: "linear-gradient(180deg, #38BDF8 0%, #0EA5E9 100%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 6px 16px rgba(14,165,233,0.30)" }}
      >
        View plans <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  )
}
