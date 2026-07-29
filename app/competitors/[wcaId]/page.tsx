import { PlaceholderPage } from "@/components/PlaceholderPage/PlaceholderPage";

export default async function CompetitorProfilePage({
  params,
}: {
  params: Promise<{ wcaId: string }>;
}) {
  const { wcaId } = await params;
  return (
    <PlaceholderPage
      title="Competitor profile"
      description={`A profile for ${wcaId.toUpperCase()} is coming soon.`}
    />
  );
}
