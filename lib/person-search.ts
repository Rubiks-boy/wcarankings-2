import { query } from "@/db";
import { isValidRegexPattern } from "@/lib/wca";

type PersonIdRow = { wca_id: string };

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
