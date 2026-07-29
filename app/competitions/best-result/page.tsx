import { RankingsPage, type SearchParams } from "@/app/RankingsPage";

export const dynamic = "force-dynamic";

export default function CompetitionBestResultPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return RankingsPage({
    searchParams,
    pathname: "/competitions/best-result",
    initialSubject: "competitions",
    initialCompetitionRanking: "best-result",
  });
}
