import {
  getWcaAuthConfig,
  makeCookie,
  readCookie,
  toWcaProfile,
} from "@/lib/wca-auth";
import { authSessionCookie, createAuthSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const storedState = readCookie(request, "wca_oauth_state");
  const { clientId, clientSecret, redirectUri, wcaOrigin } = getWcaAuthConfig(request);

  if (!code || !state || state !== storedState || !clientId || !clientSecret) {
    return Response.redirect(`${origin}/?auth=failed`, 302);
  }

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });
    const tokenResponse = await fetch(new URL("/oauth/token", wcaOrigin), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokenResponse.ok) throw new Error("Token exchange failed");
    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) throw new Error("Token was missing");

    const meResponse = await fetch(new URL("/api/v0/me", wcaOrigin), {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!meResponse.ok) throw new Error("Profile request failed");
    const profile = toWcaProfile(await meResponse.json());
    if (!profile) throw new Error("Profile was missing a WCA ID");

    const session = await createAuthSession(profile);
    const headers = new Headers({
      Location: `${origin}/?auth=success`,
      "Cache-Control": "no-store",
    });
    headers.append("Set-Cookie", authSessionCookie(session.token, request));
    headers.append("Set-Cookie", makeCookie("wca_oauth_state", "", request, { maxAge: 0 }));
    return new Response(null, { status: 302, headers });
  } catch {
    return Response.redirect(`${origin}/?auth=failed`, 302);
  }
}
