import { getAuthUser } from "@/lib/auth";
import { getWcaAuthConfig } from "@/lib/wca-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { clientSecret } = getWcaAuthConfig(request);
  if (!clientSecret) {
    return Response.json(
      { profile: null, configured: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const user = await getAuthUser(request);
  return Response.json(
    { profile: user, configured: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
