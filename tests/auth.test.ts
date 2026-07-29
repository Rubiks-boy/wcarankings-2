import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  generateSessionToken,
} from "@/lib/auth";
import { getWcaAuthConfig } from "@/lib/wca-auth";

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
