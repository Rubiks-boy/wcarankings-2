import { loadRankings } from "@/lib/rankings";
import { loadRankingMatrix } from "@/lib/ranking-matrix";
import { parseRankingView } from "@/lib/ranking-views";
import { isEventId, isRankingType, parseRegionQuery } from "@/lib/wca";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const view = parseRankingView(searchParams.get("view"));

  try {
    const rawType = searchParams.get("result") ?? searchParams.get("type");
    const type = isRankingType(rawType) ? rawType : "single";
    const { scope, regionId } = parseRegionQuery(searchParams.get("region"));
    const data = view === "wca"
      ? await loadRankings(searchParams)
      : await loadRankingMatrix({
        view,
        type,
        scope,
        regionId,
        search: (searchParams.get("search") ?? "").trim().slice(0, 80),
      });
    return Response.json(data, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=3600" },
    });
  } catch (error) {
    const rawEventId = searchParams.get("eventId") ?? searchParams.get("event");
    const rawType = searchParams.get("result") ?? searchParams.get("type");
    const eventId = isEventId(rawEventId) ? rawEventId : "333";
    const type = eventId === "333mbf" ? "single" : isRankingType(rawType) ? rawType : "single";
    const { scope } = parseRegionQuery(searchParams.get("region"));

    console.error("Rankings query failed", {
      eventId,
      type,
      scope,
      paged: searchParams.get("paged") === "1",
      search: Boolean(searchParams.get("search")),
      locate: Boolean(searchParams.get("locate")),
      error,
    });

    return Response.json(
      { error: "Rankings are unavailable." },
      { status: 503 },
    );
  }
}
