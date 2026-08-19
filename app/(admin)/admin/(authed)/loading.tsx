import { KpiSkeleton, TableSkeleton, Skeleton } from "./_components/ui"

// Route-level fallback for every Mission Control page. The sidebar and header
// live in the layout, so only the content column swaps — the chrome stays put.
export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-3.5 w-80" />
      </div>
      <KpiSkeleton />
      <TableSkeleton />
    </div>
  )
}
