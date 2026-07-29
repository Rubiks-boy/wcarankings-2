import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  generateSessionToken,
} from "@/lib/auth";
import { getRequestOrigin, getWcaAuthConfig, makeCookie, toWcaProfile } from "@/lib/wca-auth";

test("creates high-entropy opaque session tokens", () => {
  const first = generateSessionToken();
  const second = generateSessionToken();
  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(AUTH_SESSION_MAX_AGE_SECONDS, 60 * 60 * 24 * 30);
});

test("uses the configured WCA OAuth origin", () => {
  const previousOrigin = process.env.WCA_ORIGIN;
  process.env.WCA_ORIGIN = "https://staging.worldcubeassociation.org/";
  try {
    const config = getWcaAuthConfig(new Request("http://localhost:3002/"));
    assert.equal(config.wcaOrigin, "https://staging.worldcubeassociation.org");
  } finally {
    if (previousOrigin === undefined) delete process.env.WCA_ORIGIN;
    else process.env.WCA_ORIGIN = previousOrigin;
  }
});

test("uses the forwarded HTTPS protocol for callback URLs and cookies", () => {
  const request = new Request("http://wcarankings.com/api/auth/wca", {
    headers: { "x-forwarded-proto": "https" },
  });
  assert.equal(getRequestOrigin(request), "https://wcarankings.com");
  assert.match(makeCookie("state", "value", request), /; Secure$/);
});

test("prefers the WCA avatar thumbnail for the profile menu", () => {
  const profile = toWcaProfile({
    me: {
      wca_id: "2010TEST01",
      name: "Test Cuber",
      avatar: {
        thumb_url: "https://staging.worldcubeassociation.org/thumb.jpg",
        url: "https://staging.worldcubeassociation.org/full.jpg",
      },
    },
  });
  assert.equal(profile?.avatarUrl, "https://staging.worldcubeassociation.org/thumb.jpg");
});
