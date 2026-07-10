import { decodeWcaSession, getWcaAuthConfig, readCookie } from "@/lib/wca-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { clientSecret } = getWcaAuthConfig(request);
  if (!clientSecret) return Response.json({ profile: null, configured: false });
  const profile = await decodeWcaSession(readCookie(request, "wca_session"), clientSecret);
  return Response.json({ profile, configured: true }, { headers: { "Cache-Control": "no-store" } });
}

