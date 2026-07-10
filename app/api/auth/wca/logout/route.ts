import { makeCookie } from "@/lib/wca-auth";

export async function GET(request: Request) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(request.url).origin,
      "Set-Cookie": makeCookie("wca_session", "", request, { maxAge: 0 }),
      "Cache-Control": "no-store",
    },
  });
}

