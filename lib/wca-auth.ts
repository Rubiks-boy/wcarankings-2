import { env } from "cloudflare:workers";

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
  const runtime = env as unknown as Record<string, string | undefined>;
  const clientId = runtime.WCA_CLIENT_ID;
  const clientSecret = runtime.WCA_CLIENT_SECRET;
  const redirectUri = runtime.WCA_REDIRECT_URI ?? `${new URL(request.url).origin}/api/auth/wca/callback`;
  return { clientId, clientSecret, redirectUri };
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

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signature(value: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function encodeWcaSession(profile: WcaProfile, secret: string) {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(profile)));
  const signed = toBase64Url(await signature(payload, secret));
  return `${payload}.${signed}`;
}

export async function decodeWcaSession(value: string | null, secret: string) {
  if (!value) return null;
  const [payload, receivedSignature] = value.split(".");
  if (!payload || !receivedSignature) return null;
  const expectedSignature = await signature(payload, secret);
  const received = fromBase64Url(receivedSignature);
  if (received.length !== expectedSignature.length) return null;

  let mismatch = 0;
  for (let index = 0; index < received.length; index += 1) {
    mismatch |= received[index] ^ expectedSignature[index];
  }
  if (mismatch !== 0) return null;

  try {
    return JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as WcaProfile;
  } catch {
    return null;
  }
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

