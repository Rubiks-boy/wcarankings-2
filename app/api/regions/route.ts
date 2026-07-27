import { query } from "@/db";
import { FALLBACK_CONTINENTS, FALLBACK_COUNTRIES } from "@/lib/wca";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind") === "continent" ? "continent" : "country";

  try {
    const idColumn = kind === "continent" ? "continent_id" : "country_id";
    const nameColumn = kind === "continent" ? "continent_id" : "country_name";
    const result = await query<{ id: string; name: string }>(
      `SELECT DISTINCT ${idColumn} AS id, ${nameColumn} AS name
       FROM ranking_entries
       ORDER BY name`,
    );

    return Response.json({ regions: result.rows, source: "wca" }, {
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    });
  } catch {
    return Response.json({
      regions: kind === "continent" ? FALLBACK_CONTINENTS : FALLBACK_COUNTRIES,
      source: "demo",
    });
  }
}
