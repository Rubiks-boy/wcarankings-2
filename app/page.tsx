import { RankingsPage, type SearchParams } from "@/app/RankingsPage";

export const dynamic = "force-dynamic";

export default function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return RankingsPage({ searchParams });
}
