import { RankingsPage, type SearchParams } from "@/app/RankingsPage";

export const dynamic = "force-dynamic";

export default function CompetitionLatitudePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return RankingsPage({
    searchParams,
    pathname: "/competitions/latitude",
    initialSubject: "competitions",
    initialCompetitionRanking: "latitude",
  });
}
