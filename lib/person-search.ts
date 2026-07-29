import { query } from "@/db";
import { ApiInputError } from "@/lib/projection-api";
import { isValidRegexPattern } from "@/lib/wca";

type PersonIdRow = { wca_id: string };
type PersonSearchRow = {
  wca_id: string;
  name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
};

function escapeLikePrefix(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export async function searchPersonIds(search: string, regexSearch: boolean, limit: number) {
  if (regexSearch && !isValidRegexPattern(search)) throw new Error("Invalid regular expression.");

  const nameCondition = regexSearch ? "name REGEXP ?" : "name LIKE ? ESCAPE '\\\\'";
  const namePattern = regexSearch ? search : `${escapeLikePrefix(search)}%`;
  const result = await query<PersonIdRow>(
    `SELECT wca_id FROM persons
     WHERE sub_id = 1
       AND (wca_id = ? OR ${nameCondition})
     ORDER BY (wca_id = ?) DESC, name, wca_id
     LIMIT ?`,
    [search.toUpperCase(), namePattern, search.toUpperCase(), limit],
  );

  return {
    personIds: result.rows.map((row) => row.wca_id),
    timings: result.timings,
    returnedRows: result.rows.length,
  };
}

export async function loadPersonSearch(params: URLSearchParams) {
  const search = (params.get("q") ?? "").trim().slice(0, 80);
  if (!search) throw new ApiInputError("q is required.");
  const mode = params.get("mode") ?? "prefix";
  if (mode !== "prefix" && mode !== "regex") throw new ApiInputError("mode must be prefix or regex.");
  if (mode === "regex" && !isValidRegexPattern(search)) throw new ApiInputError("Invalid regular expression.");
  const rawLimit = Number(params.get("limit") ?? 20);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 50) {
    throw new ApiInputError("limit must be between 1 and 50.");
  }
  const nameCondition = mode === "regex" ? "person.name REGEXP ?" : "person.name LIKE ? ESCAPE '\\\\'";
  const namePattern = mode === "regex" ? search : `${escapeLikePrefix(search)}%`;
  const result = await query<PersonSearchRow>(
    `SELECT person.wca_id, person.name, person.country_id,
       COALESCE(country.name, person.country_id) AS country_name,
       COALESCE(country.iso2, '') AS country_iso2
     FROM persons person
     LEFT JOIN countries country ON country.id = person.country_id
     WHERE person.sub_id = 1
       AND (person.wca_id = ? OR ${nameCondition})
     ORDER BY (person.wca_id = ?) DESC, person.name, person.wca_id
     LIMIT ?`,
    [search.toUpperCase(), namePattern, search.toUpperCase(), rawLimit],
  );
  return {
    data: {
      entries: result.rows.map((row) => ({
        personId: row.wca_id,
        name: row.name,
        country: { id: row.country_id, name: row.country_name, iso2: row.country_iso2 },
      })),
      context: { resource: "person-search", query: search, mode },
      page: { limit: rawLimit, hasMore: result.rows.length === rawLimit, next: null },
      total: result.rows.length,
    },
    diagnostics: { timings: result.timings, queryCount: 1, returnedRows: result.rows.length },
  };
}
