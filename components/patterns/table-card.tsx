import { cn } from "@/lib/utils";

/**
 * The bordered, clipped frame every full-width data table sits in.
 *
 * `overflow-hidden` is what keeps the table's own corners inside the border
 * radius; without it the first header cell's background squares off the top
 * corners.
 */
export function TableCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("overflow-hidden rounded-lg border", className)}>
      {children}
    </div>
  );
}
