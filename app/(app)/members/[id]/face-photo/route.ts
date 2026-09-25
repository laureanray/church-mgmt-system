import { requirePermission } from "@/lib/auth-helpers";
import { getFacePhoto } from "@/server/faces";

/**
 * The member's enrolment photo, for the preview on their page. A route rather
 * than a data URL in the page, so the page's HTML stays small and the photo
 * loads only where it is shown. Same permission as the page.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requirePermission("members.view");
  const { id } = await params;

  const photo = await getFacePhoto(user, id);
  if (!photo) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(photo), {
    headers: {
      "Content-Type": "image/jpeg",
      // A face is personal data: kept out of shared caches, and the page adds
      // ?v=<enrolled at> so a replaced photo is never shown stale.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
