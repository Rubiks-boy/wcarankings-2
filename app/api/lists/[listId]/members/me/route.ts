import { requireAuthUser } from "@/lib/auth";
import { apiError, assertSameOrigin } from "@/lib/api";
import { removeSelfFromList } from "@/lib/lists";

type RouteContext = {
  params: Promise<{ listId: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser(request);
    const { listId } = await context.params;
    await removeSelfFromList(user, listId);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
