import { PlaceholderPage } from "@/components/PlaceholderPage/PlaceholderPage";

export default async function CompetitionProfilePage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const { competitionId } = await params;
  return (
    <PlaceholderPage
      title="Competition profile"
      description={`A profile for ${competitionId} is coming soon.`}
    />
  );
}
