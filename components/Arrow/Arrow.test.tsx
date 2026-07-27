import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Arrow } from "./Arrow";

test("renders both arrow directions", () => {
  assert.match(renderToStaticMarkup(<Arrow direction="up" />), /svg/);
  assert.match(renderToStaticMarkup(<Arrow direction="down" />), /svg/);
});
