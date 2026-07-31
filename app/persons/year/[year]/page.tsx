import { notFound } from "next/navigation";
import { RankingsPage } from "@/app/RankingsPage";

export const dynamic = "force-dynamic";

export default async function YearlyPersonsPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const { year } = await params;
  if (!/^\d{4}$/.test(year)) notFound();
  return <RankingsPage />;
}
