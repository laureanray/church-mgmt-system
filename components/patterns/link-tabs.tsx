import Link from "next/link";

import { cn } from "@/lib/utils";

export type LinkTab = {
  href: string;
  label: string;
  /** A count beside the label, e.g. how many entries the tab holds. */
  count?: number;
  active?: boolean;
};

/**
 * Tabs whose selection is the URL, like every other piece of page state here.
 *
 * Each tab is a link to its own address — `?tab=history` — so the server only
 * queries the panel that is showing, the choice survives a reload and the back
 * button, and the page stays a Server Component. That makes this navigation,
 * not an ARIA tablist: the links sit in a `<nav>` and the current one carries
 * `aria-current="page"`, which is what a screen reader expects of links.
 */
export function LinkTabs({
  label,
  tabs,
  className,
}: {
  /** Names the navigation for assistive tech, e.g. "Member record". */
  label: string;
  tabs: LinkTab[];
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("border-b", className)}>
      <ul className="-mb-px flex gap-4 overflow-x-auto">
        {tabs.map((tab) => (
          <li key={tab.href}>
            <Link
              href={tab.href}
              scroll={false}
              aria-current={tab.active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 border-b-2 border-transparent px-1 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50",
                tab.active && "border-primary text-foreground",
              )}
            >
              {tab.label}
              {tab.count !== undefined ? (
                <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">
                  {tab.count}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
