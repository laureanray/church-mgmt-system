import { apiRoute, readJson } from "@/server/http";
import * as membersService from "@/server/members";

type Context = RouteContext<"/api/v1/members/[id]">;

/** GET /api/v1/members/:id */
export const GET = apiRoute<Context>(async (actor, _request, { params }) => {
  const { id } = await params;
  return Response.json(await membersService.getMember(actor, id));
});

/** PUT /api/v1/members/:id — replace the member's editable fields. */
export const PUT = apiRoute<Context>(async (actor, request, { params }) => {
  const { id } = await params;
  const { member } = await membersService.updateMember(
    actor,
    id,
    await readJson(request),
  );
  return Response.json(member);
});

/** DELETE /api/v1/members/:id */
export const DELETE = apiRoute<Context>(async (actor, _request, { params }) => {
  const { id } = await params;
  await membersService.deleteMember(actor, id);
  return new Response(null, { status: 204 });
});
