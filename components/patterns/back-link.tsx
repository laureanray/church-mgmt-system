import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/**
 * The "← Back to members" link that sits above a detail or form page's header.
 *
 * The negative left margin is deliberate: a ghost button's padding would
 * otherwise push the arrow off the page's left grid line, so the label optically
 * aligns with the `<h1>` beneath it rather than the button's box.
 */
export function BackLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "mb-2 -ml-2",
        className,
      )}
    >
      <ArrowLeft className="size-4" />
      {label}
    </Link>
  );
}
