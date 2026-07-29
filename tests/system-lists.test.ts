import assert from "node:assert/strict";
import test from "node:test";
import {
  primaryNameToken,
  SYSTEM_LIST_DEFINITIONS,
} from "../scripts/system-list-definitions.mjs";

test("system list aliases are stable and unique", () => {
  assert.deepEqual(
    SYSTEM_LIST_DEFINITIONS.map((definition) => definition.alias),
    ["max", "luke"],
  );
  assert.equal(
    new Set(SYSTEM_LIST_DEFINITIONS.map((definition) => definition.alias)).size,
    SYSTEM_LIST_DEFINITIONS.length,
  );
});

test("first-token matching is exact and ignores a parenthesized local name", () => {
  assert.equal(primaryNameToken("Max Park"), "max");
  assert.equal(primaryNameToken("  Luke Garrett  "), "luke");
  assert.equal(primaryNameToken("Max Park (박맥스)"), "max");
  assert.notEqual(primaryNameToken("Maxwell Park"), "max");
});
