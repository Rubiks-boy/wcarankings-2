import { handleProjectionApi } from "@/lib/projection-api";
import { loadResultRankings } from "@/lib/semantic-result-rankings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionApi(request, "result-rankings", loadResultRankings);
}
