import { RankingsPage, type SearchParams } from "@/app/RankingsPage";

export const dynamic = "force-dynamic";

export default function CompetitionPodiumsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return RankingsPage({
    searchParams,
    pathname: "/competitions/podiums",
    initialSubject: "competitions",
    initialCompetitionRanking: "podiums",
  });
}
