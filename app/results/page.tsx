import { RankingsPage, type SearchParams } from "@/app/RankingsPage";

export const dynamic = "force-dynamic";

export default function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return RankingsPage({
    searchParams,
    pathname: "/results",
    initialSubject: "results",
  });
}
