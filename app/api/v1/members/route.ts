import { apiRoute, listParam, readJson } from "@/server/http";
import * as membersService from "@/server/members";
import type { MemberListQuery } from "@/server/members";

/**
 * GET /api/v1/members — one page of the directory.
 *   ?search= &gender= &marital= &status= &sort= &direction= &page= &perPage=
 *   `status` defaults to the directory view (active, visitor); `status=all`
 *   lifts it.
 */
export const GET = apiRoute(async (actor, request) => {
  const params = new URL(request.url).searchParams;
  // Raw strings, deliberately: the service parses its own input, so an
  // unknown gender or sort key comes back as a 422 naming the field.
  const query = {
    search: params.get("search") ?? undefined,
    gender: listParam(params, "gender"),
    marital: listParam(params, "marital"),
    status: listParam(params, "status"),
    sort: params.get("sort") ?? undefined,
    direction: params.get("direction") ?? undefined,
    page: params.get("page") ?? undefined,
    perPage: params.get("perPage") ?? undefined,
  } as MemberListQuery;
  return Response.json(await membersService.listMembers(actor, query));
});

/** POST /api/v1/members — create a member from a JSON body. */
export const POST = apiRoute(async (actor, request) => {
  const member = await membersService.createMember(actor, await readJson(request));
  return Response.json(member, {
    status: 201,
    headers: { Location: `/api/v1/members/${member.id}` },
  });
});
