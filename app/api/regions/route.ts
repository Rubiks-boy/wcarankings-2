import { query } from "@/db";
import { FALLBACK_CONTINENTS, FALLBACK_COUNTRIES } from "@/lib/wca";

export const dynamic = "force-dynamic";

type WcaCountry = {
  id: string;
  name: string;
  iso2?: string;
};

let countriesRequest: Promise<WcaCountry[]> | null = null;

function getWcaCountries() {
  if (!countriesRequest) {
    countriesRequest = fetch("https://www.worldcubeassociation.org/api/v0/countries", {
      signal: AbortSignal.timeout(5000),
    }).then(async (response) => {
      if (!response.ok) return [];
      const data = await response.json() as unknown;
      if (!Array.isArray(data)) return [];
      return data.filter((country): country is WcaCountry => (
        typeof country === "object" && country !== null &&
        typeof (country as { id?: unknown }).id === "string" &&
        typeof (country as { name?: unknown }).name === "string"
      ));
    }).catch(() => {
      countriesRequest = null;
      return [];
    });
  }
  return countriesRequest;
}

export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind") === "continent" ? "continent" : "country";

  try {
    if (kind === "country") {
      const wcaCountries = await getWcaCountries();
      if (wcaCountries.length > 0) {
        return Response.json({ regions: wcaCountries, source: "wca" }, {
          headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
        });
      }
    }

    const idColumn = kind === "continent" ? "continent_id" : "country_id";
    const nameColumn = kind === "continent" ? "continent_id" : "country_name";
    const isoColumn = kind === "continent" ? "''" : "country_iso2";
    const result = await query<{ id: string; name: string; iso2: string }>(
      `SELECT DISTINCT ${idColumn} AS id, ${nameColumn} AS name, ${isoColumn} AS iso2
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
