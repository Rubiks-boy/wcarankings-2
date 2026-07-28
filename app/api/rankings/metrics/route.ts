import { handleProjectionApi } from "@/lib/projection-api";
import { loadMetricRankings } from "@/lib/semantic-metric-rankings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionApi(request, "metric-rankings", loadMetricRankings);
}
