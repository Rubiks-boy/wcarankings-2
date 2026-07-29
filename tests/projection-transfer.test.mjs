import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const prepare = await readFile(
  new URL("../scripts/prepare-projection-transfer.mjs", import.meta.url),
  "utf8",
);
const publish = await readFile(
  new URL("../scripts/publish-projection-transfer.mjs", import.meta.url),
  "utf8",
);

test("defers secondary projection indexes until after bulk transfer import", () => {
  assert.match(prepare, /SHOW INDEX FROM/);
  assert.match(prepare, /DROP INDEX/);
  assert.match(prepare, /projection_transfer_indexes/);
  assert.match(publish, /Building \$\{deferredIndexes\.length\} deferred projection indexes/);
  assert.match(publish, /indexes\.map\(\(index\) => index\.index_sql\)\.join/);
  assert.match(publish, /promoteProjectionTables/);
});
