"use client"

/**
 * ChannelChip — small pill showing the lead's most-recent communication
 * channel. Used in /queue Top-N rows and any future ranked-list surface.
 *
 * Channel mapping (driven by lib/scoring/channel-hint.ts):
 *   whatsapp → emerald (matches WhatsApp brand)
 *   email    → sky
 *   phone    → violet
 *   website  → slate (default for cold inbound)
 *
 * Strictly visual — no click handler. Tooltip via title attr.
 */

import { MessageCircle, Mail, Phone, Globe } from "lucide-react"
import type { LeadChannel } from "@/lib/scoring/channel-hint"
import { cn } from "@/lib/utils"

const STYLES: Record<LeadChannel, { bg: string; text: string; label: string; Icon: typeof MessageCircle }> = {
  whatsapp: { bg: "bg-emerald-50",  text: "text-emerald-700", label: "WhatsApp", Icon: MessageCircle },
  email:    { bg: "bg-sky-50",      text: "text-sky-700",     label: "Email",    Icon: Mail },
  phone:    { bg: "bg-violet-50",   text: "text-violet-700",  label: "Phone",    Icon: Phone },
  website:  { bg: "bg-slate-100",   text: "text-slate-600",   label: "Website",  Icon: Globe },
}

export interface ChannelChipProps {
  channel: LeadChannel
  className?: string
}

export function ChannelChip({ channel, className }: ChannelChipProps) {
  const { bg, text, label, Icon } = STYLES[channel]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold",
        bg, text, className,
      )}
      title={`Last activity: ${label}`}
    >
      <Icon className="w-3 h-3" strokeWidth={2.4} />
      {label}
    </span>
  )
}
