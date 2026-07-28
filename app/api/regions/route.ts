import { getRegions, type RegionKind } from "@/lib/regions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const kind: RegionKind = new URL(request.url).searchParams.get("kind") === "continent" ? "continent" : "country";
  const regions = await getRegions(kind);
  return Response.json({ regions }, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
