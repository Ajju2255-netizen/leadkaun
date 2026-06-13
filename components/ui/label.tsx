"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        // App field-label language — matches the uppercase-tracked labels used by
        // the Won/Lost inline modals so every modal field reads the same way.
        "flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
