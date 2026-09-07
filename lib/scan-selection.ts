type Occurrence = { id: string; scheduledAt: Date };

/**
 * What the scan picker lists, and which service it opens on.
 *
 * The two are decided together on purpose. The picker's value is the id the
 * camera records against, so a selected id with no matching option in the list
 * is not a cosmetic mismatch: the trigger renders blank while check-ins go to a
 * service nobody can see. The invariant this exists to hold is that the
 * returned `initialServiceId` is always the id of a row in `rows`.
 *
 * `nearby` is a window around now rather than every service ever held, so a
 * deep link from an older service's page can legitimately fall outside it —
 * hence `requested`, which is folded in rather than discarded. Dropping it
 * would silently point the camera at a *different* service than the one the
 * link named, which is worse than showing an extra option.
 */
export function selectScanServices<T extends Occurrence>(
  nearby: T[],
  requested: T | undefined,
  now: number,
): { rows: T[]; initialServiceId?: string } {
  const rows = [...nearby];

  if (requested && !rows.some((s) => s.id === requested.id)) {
    rows.push(requested);
  }

  rows.sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());

  if (requested) {
    return { rows, initialServiceId: requested.id };
  }

  if (rows.length === 0) {
    return { rows, initialServiceId: undefined };
  }

  // Otherwise open on whatever is happening closest to now.
  const nearest = rows.reduce((best, s) =>
    Math.abs(s.scheduledAt.getTime() - now) <
    Math.abs(best.scheduledAt.getTime() - now)
      ? s
      : best,
  );

  return { rows, initialServiceId: nearest.id };
}
