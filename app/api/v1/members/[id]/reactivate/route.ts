import { apiRoute } from "@/server/http";
import * as membersService from "@/server/members";

type Context = RouteContext<"/api/v1/members/[id]/reactivate">;

/**
 * POST /api/v1/members/:id/reactivate — mark a lapsed member active.
 * 409 when the member is not lapsed (someone changed them in the meantime).
 */
export const POST = apiRoute<Context>(async (actor, _request, { params }) => {
  const { id } = await params;
  return Response.json(await membersService.reactivateMember(actor, id));
});
