import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

/**
 * EmptyState — consistent "nothing here yet" treatment (audit B8). Use to make
 * empty states explicit and on-brand instead of a blank card or a bare "—".
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center gap-3 py-10 px-4", className)}>
      {Icon && (
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-slate-100">
          <Icon className="w-6 h-6 text-slate-400" strokeWidth={1.8} />
        </div>
      )}
      <div className="space-y-1">
        <p className="text-[14px] font-semibold text-slate-700">{title}</p>
        {description && (
          <p className="text-[12px] text-slate-400 max-w-xs leading-relaxed">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}
