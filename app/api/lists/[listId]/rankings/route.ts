import { getAuthUser } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { loadListRankings } from "@/lib/list-rankings";
import {
  assertCanViewList,
  resolveList,
} from "@/lib/lists";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ listId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const startedAt = performance.now();
  try {
    const { listId } = await context.params;
    const [list, user] = await Promise.all([
      resolveList(listId),
      getAuthUser(request),
    ]);
    assertCanViewList(list, user);
    const result = await loadListRankings(
      list,
      new URL(request.url).searchParams,
    );
    const totalMs = performance.now() - startedAt;
    console.info(
      JSON.stringify({
        operation: "list-rankings",
        list_id: list.id,
        list_kind: list.kind,
        member_count: list.memberCount,
        returned_rows: result.entries.length,
        total_ms: totalMs,
      }),
    );
    return Response.json(result, {
      headers: {
        "Cache-Control":
          list.visibility === "public"
            ? "public, max-age=30, s-maxage=300, stale-while-revalidate=60"
            : "private, no-store",
        "Server-Timing": `total;dur=${totalMs.toFixed(1)}`,
        "X-List-Membership-Version": String(list.membershipVersion),
        "X-Rankings-Data-Version": result.exportDate ?? "unknown",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
