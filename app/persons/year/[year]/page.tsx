import { notFound } from "next/navigation";
import { RankingsPage, type SearchParams } from "@/app/RankingsPage";

export const dynamic = "force-dynamic";

export default function YearlyPersonsPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>;
  searchParams: Promise<SearchParams>;
}) {
  return params.then(({ year }) => {
    if (!/^\d{4}$/.test(year)) notFound();
    return RankingsPage({
      searchParams,
      pathname: `/persons/year/${year}`,
      initialYearOverride: Number(year),
    });
  });
}
