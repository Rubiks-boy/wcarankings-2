import { handleProjectionApi } from "@/lib/projection-api";
import { loadPersonSearch } from "@/lib/person-search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionApi(request, "person-search", loadPersonSearch);
}
