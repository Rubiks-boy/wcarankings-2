import { handleProjectionApi } from "@/lib/projection-api";
import { loadPodiumRankings } from "@/lib/semantic-entity-rankings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionApi(request, "podium-rankings", loadPodiumRankings);
}
