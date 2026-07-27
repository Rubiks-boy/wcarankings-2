import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SearchIcon } from "./SearchIcon";

test("renders the search icon", () => {
  assert.match(renderToStaticMarkup(<SearchIcon />), /circle/);
});
