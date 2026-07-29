import { RankingsPage, type SearchParams } from "@/app/RankingsPage";

export const dynamic = "force-dynamic";

export default function CompetitionCompetitorCountPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return RankingsPage({
    searchParams,
    pathname: "/competitions/competitor-count",
    initialSubject: "competitions",
    initialCompetitionRanking: "competitor-count",
  });
}
