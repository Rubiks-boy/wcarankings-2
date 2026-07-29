import { getAuthUser, requireAuthUser } from "@/lib/auth";
import {
  apiError,
  assertSameOrigin,
  readJsonObject,
} from "@/lib/api";
import {
  addListMembers,
  assertCanViewList,
  listMembers,
  resolveList,
} from "@/lib/lists";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ listId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { listId } = await context.params;
    const [list, user] = await Promise.all([
      resolveList(listId),
      getAuthUser(request),
    ]);
    assertCanViewList(list, user);
    const searchParams = new URL(request.url).searchParams;
    const page = await listMembers(list, {
      after: searchParams.get("after") ?? "",
      limit: Number(searchParams.get("limit")) || 50,
    });
    return Response.json(
      { list, ...page },
      {
        headers: {
          "Cache-Control":
            list.visibility === "public"
              ? "public, max-age=30, s-maxage=120"
              : "private, no-store",
        },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser(request);
    const body = await readJsonObject(request);
    const { listId } = await context.params;
    const result = await addListMembers(
      user,
      listId,
      Array.isArray(body.personIds) ? body.personIds : [],
      body.source === "bulk_import" ? "bulk_import" : "owner",
    );
    return Response.json(
      result,
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
