import { RankingsExplorer } from "@/components/RankingsExplorer/RankingsExplorer";
import { getRegions } from "@/lib/regions";

export const dynamic = "force-dynamic";

export async function RankingsPage() {
  const [continents, countries] = await Promise.all([
    getRegions("continent"),
    getRegions("country"),
  ]);

  return (
    <RankingsExplorer
      initial={{ regions: { continents, countries } }}
      options={{ showSubjectSwitch: true, showAllEventRankingOptions: true }}
    />
  );
}
