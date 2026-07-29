import { requireAuthUser } from "@/lib/auth";
import {
  apiError,
  assertSameOrigin,
  readJsonObject,
} from "@/lib/api";
import {
  decideMembershipRequest,
  ListValidationError,
} from "@/lib/lists";

type RouteContext = {
  params: Promise<{ listId: string; requestId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser(request);
    const body = await readJsonObject(request);
    if (body.decision !== "accepted" && body.decision !== "rejected") {
      throw new ListValidationError("Decision must be accepted or rejected.");
    }
    const { listId, requestId: rawRequestId } = await context.params;
    const requestId = Number(rawRequestId);
    if (!Number.isSafeInteger(requestId) || requestId <= 0) {
      throw new ListValidationError("Invalid membership request ID.");
    }
    const result = await decideMembershipRequest(
      user,
      listId,
      requestId,
      body.decision,
    );
    return Response.json(
      { status: body.decision, ...result },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
