import { requireAuthUser } from "@/lib/auth";
import { apiError, assertSameOrigin } from "@/lib/api";
import { removeListMember } from "@/lib/lists";

type RouteContext = {
  params: Promise<{ listId: string; personId: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser(request);
    const { listId, personId } = await context.params;
    const removed = await removeListMember(user, listId, personId);
    return Response.json(
      { removed },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
