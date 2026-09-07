import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown the instant a navigation starts, until the page's data resolves.
 *
 * Every route in this group is dynamic — each one reads cookies to authenticate
 * — so nothing here can be prerendered. Without a loading boundary the router
 * has to hold the *previous* page on screen for the whole server round trip,
 * which reads as a dead click. This also gives <Link> a shell worth
 * prefetching, so the group's routes warm up before they are opened.
 *
 * It mirrors the shape every page shares — a PageHeader, then content — rather
 * than any one page's layout, since the whole group renders through here.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>

      <div className="mt-6 space-y-3 rounded-lg border p-4">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
