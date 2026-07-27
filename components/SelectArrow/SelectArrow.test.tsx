import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SelectArrow } from "./SelectArrow";

test("renders the select arrow path", () => {
  assert.match(renderToStaticMarkup(<SelectArrow />), /M7 10L12 15L17 10/);
});
