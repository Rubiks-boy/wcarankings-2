import { env } from "cloudflare:workers";
import { FALLBACK_CONTINENTS, FALLBACK_COUNTRIES } from "@/lib/wca";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind") === "continent" ? "continent" : "country";

  try {
    const database = env.DB;
    if (!database) throw new Error("D1 is not available");

    const idColumn = kind === "continent" ? "continent_id" : "country_id";
    const nameColumn = kind === "continent" ? "continent_id" : "country_name";
    const result = await database
      .prepare(
        `SELECT DISTINCT ${idColumn} AS id, ${nameColumn} AS name
         FROM ranking_entries
         ORDER BY name`,
      )
      .all<{ id: string; name: string }>();

    return Response.json({ regions: result.results, source: "wca" }, {
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    });
  } catch {
    return Response.json({
      regions: kind === "continent" ? FALLBACK_CONTINENTS : FALLBACK_COUNTRIES,
      source: "demo",
    });
  }
}

