"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * A `<Link>` that prefetches its whole page once the user shows intent to
 * follow it — a pointer resting on it, keyboard focus, or a finger going down.
 *
 * Every route in this app authenticates, so every route is dynamic, and a plain
 * `<Link>` prefetches only as far as the `loading.tsx` skeleton: the click
 * still waits on a full round trip to the server. `prefetch={true}` would fix
 * that, but on viewport entry — every sidebar item rendering its page on every
 * load. This spends that render only on the one link about to be clicked, in
 * the 100–300ms between hover and click that would otherwise be idle.
 *
 * Use it for primary navigation: the sidebar, and any link a user is likely to
 * follow from a page they land on. Leave ordinary in-content links as `<Link>`.
 * The prefetched page is reused for `staleTimes.static` (next.config.ts).
 *
 * Handlers passed in are called, not replaced — Base UI's `render` prop merges
 * its own tooltip handlers onto this element.
 */
export function IntentLink({
  onPointerEnter,
  onFocus,
  onTouchStart,
  ...props
}: Omit<ComponentProps<typeof Link>, "prefetch">) {
  const [intent, setIntent] = useState(false);

  return (
    <Link
      {...props}
      // `false` still leaves Next's own hover prefetch of the skeleton; `true`
      // upgrades it to the full page once intent is known.
      prefetch={intent}
      onPointerEnter={(event) => {
        setIntent(true);
        onPointerEnter?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
    />
  );
}
