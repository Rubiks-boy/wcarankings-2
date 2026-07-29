export type WcaProfile = {
  wcaId: string;
  name: string;
  countryIso2: string;
  avatarUrl: string | null;
};

type WcaMeResponse = {
  me?: {
    wca_id?: string;
    name?: string;
    country_iso2?: string;
    avatar?: { thumb_url?: string; url?: string };
  };
};

export function getWcaAuthConfig(request: Request) {
  const runtime = process.env;
  const clientId = runtime.WCA_CLIENT_ID;
  const clientSecret = runtime.WCA_CLIENT_SECRET;
  const redirectUri = runtime.WCA_REDIRECT_URI ?? `${new URL(request.url).origin}/api/auth/wca/callback`;
  const wcaOrigin = (runtime.WCA_ORIGIN ?? "https://www.worldcubeassociation.org").replace(/\/+$/, "");
  return { clientId, clientSecret, redirectUri, wcaOrigin };
}

export function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const cookie of cookies.split(";")) {
    const [rawKey, ...rawValue] = cookie.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

export function makeCookie(
  name: string,
  value: string,
  request: Request,
  options: { maxAge?: number; sameSite?: "Lax" | "Strict" } = {},
) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const maxAge = options.maxAge === undefined ? "" : `; Max-Age=${options.maxAge}`;
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=${options.sameSite ?? "Lax"}${maxAge}${secure}`;
}

export function toWcaProfile(response: WcaMeResponse): WcaProfile | null {
  const me = response.me;
  if (!me?.wca_id || !me.name) return null;
  return {
    wcaId: me.wca_id,
    name: me.name,
    countryIso2: me.country_iso2 ?? "",
    avatarUrl: me.avatar?.thumb_url ?? me.avatar?.url ?? null,
  };
}
