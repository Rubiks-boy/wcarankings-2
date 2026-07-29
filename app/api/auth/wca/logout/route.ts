import {
  clearAuthSessionCookie,
  deleteAuthSession,
} from "@/lib/auth";
import { getRequestOrigin } from "@/lib/wca-auth";

async function logout(request: Request) {
  await deleteAuthSession(request);
  return new Response(null, {
    status: 302,
    headers: {
      Location: getRequestOrigin(request),
      "Set-Cookie": clearAuthSessionCookie(request),
      "Cache-Control": "no-store",
    },
  });
}

export const GET = logout;
export const POST = logout;
