import { getWcaAuthConfig, makeCookie } from "@/lib/wca-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { clientId, redirectUri } = getWcaAuthConfig(request);
  const origin = new URL(request.url).origin;
  if (!clientId) return Response.redirect(`${origin}/?auth=not-configured`, 302);

  const state = crypto.randomUUID();
  const authorizeUrl = new URL("https://www.worldcubeassociation.org/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "public");
  authorizeUrl.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl.toString(),
      "Set-Cookie": makeCookie("wca_oauth_state", state, request, { maxAge: 600, sameSite: "Lax" }),
      "Cache-Control": "no-store",
    },
  });
}

