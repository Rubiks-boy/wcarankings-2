import { createHash, randomBytes } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { query, withTransaction } from "@/db";
import {
  makeCookie,
  readCookie,
  type WcaProfile,
} from "@/lib/wca-auth";

export const AUTH_SESSION_COOKIE = "wca_session";
export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type AuthUser = {
  id: number;
  wcaId: string;
  name: string;
  countryIso2: string;
  avatarUrl: string | null;
};

type AuthUserRow = RowDataPacket & {
  id: number;
  wca_id: string;
  name: string;
  country_iso2: string;
  avatar_url: string | null;
};

function toAuthUser(row: AuthUserRow): AuthUser {
  return {
    id: Number(row.id),
    wcaId: row.wca_id,
    name: row.name,
    countryIso2: row.country_iso2,
    avatarUrl: row.avatar_url,
  };
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest();
}

export function generateSessionToken() {
  return randomBytes(32).toString("base64url");
}

export async function createAuthSession(profile: WcaProfile) {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + AUTH_SESSION_MAX_AGE_SECONDS * 1000);

  const user = await withTransaction(async (connection) => {
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO app_users
        (wca_id, name, country_iso2, avatar_url, last_login_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(6))
       ON DUPLICATE KEY UPDATE
        id = LAST_INSERT_ID(id),
        name = VALUES(name),
        country_iso2 = VALUES(country_iso2),
        avatar_url = VALUES(avatar_url),
        last_login_at = CURRENT_TIMESTAMP(6)`,
      [profile.wcaId, profile.name, profile.countryIso2, profile.avatarUrl],
    );
    const userId = Number(result.insertId);
    await connection.execute(
      `INSERT INTO auth_sessions (token_hash, user_id, expires_at)
       VALUES (?, ?, ?)`,
      [tokenHash, userId, expiresAt],
    );
    const [rows] = await connection.execute<AuthUserRow[]>(
      `SELECT id, wca_id, name, country_iso2, avatar_url
       FROM app_users
       WHERE id = ?`,
      [userId],
    );
    if (!rows[0]) throw new Error("The WCA user could not be persisted.");
    return toAuthUser(rows[0]);
  });

  return { token, user, expiresAt };
}

export async function getAuthUser(request: Request) {
  const token = readCookie(request, AUTH_SESSION_COOKIE);
  if (!token) return null;
  const result = await query<AuthUserRow>(
    `SELECT
      u.id,
      u.wca_id,
      u.name,
      u.country_iso2,
      u.avatar_url
     FROM auth_sessions AS s
     JOIN app_users AS u ON u.id = s.user_id
     WHERE s.token_hash = ?
       AND s.expires_at > CURRENT_TIMESTAMP(6)
     LIMIT 1`,
    [hashSessionToken(token)],
  );
  return result.rows[0] ? toAuthUser(result.rows[0]) : null;
}

export async function deleteAuthSession(request: Request) {
  const token = readCookie(request, AUTH_SESSION_COOKIE);
  if (!token) return;
  await withTransaction(async (connection) => {
    await connection.execute(
      "DELETE FROM auth_sessions WHERE token_hash = ?",
      [hashSessionToken(token)],
    );
  });
}

export function authSessionCookie(token: string, request: Request) {
  return makeCookie(AUTH_SESSION_COOKIE, token, request, {
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
    sameSite: "Lax",
  });
}

export function clearAuthSessionCookie(request: Request) {
  return makeCookie(AUTH_SESSION_COOKIE, "", request, {
    maxAge: 0,
    sameSite: "Lax",
  });
}

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Sign in with the WCA to continue.");
    this.name = "AuthenticationRequiredError";
  }
}

export async function requireAuthUser(request: Request) {
  const user = await getAuthUser(request);
  if (!user) throw new AuthenticationRequiredError();
  return user;
}
