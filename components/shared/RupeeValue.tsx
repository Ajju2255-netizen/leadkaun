import { cn } from "@/lib/utils"
import { formatRupee } from "@/lib/format"

interface Props {
  amount:    number | null | undefined
  className?: string
  muted?:    boolean
}

export function RupeeValue({ amount, className, muted }: Props) {
  return (
    <span className={cn("tabular-nums", muted && "text-muted-foreground", className)}>
      {formatRupee(amount)}
    </span>
  )
}
