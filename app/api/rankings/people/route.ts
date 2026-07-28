import { handleProjectionApi } from "@/lib/projection-api";
import { loadPersonRankings } from "@/lib/semantic-person-rankings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionApi(request, "person-rankings", loadPersonRankings);
}
