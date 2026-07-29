import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  generateSessionToken,
} from "@/lib/auth";

test("creates high-entropy opaque session tokens", () => {
  const first = generateSessionToken();
  const second = generateSessionToken();
  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(AUTH_SESSION_MAX_AGE_SECONDS, 60 * 60 * 24 * 30);
});

