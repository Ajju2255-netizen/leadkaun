import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * NativeSelect — a native <select> styled to match the app's text inputs, with
 * a custom chevron (appearance-none) instead of the OS default. Keeps native
 * accessibility/behaviour while giving one consistent dropdown language across
 * settings (audit B7 — Org/Team/ICP used raw <select> with the OS chevron).
 */
export function NativeSelect({
  className,
  wrapperClassName,
  children,
  ...props
}: React.ComponentProps<"select"> & { wrapperClassName?: string }) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <select
        {...props}
        className={cn(
          "w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-9 text-[13px]",
          "text-slate-900 cursor-pointer transition-all",
          "focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400",
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
    </div>
  )
}
