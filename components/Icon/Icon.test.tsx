import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Icon } from "./Icon";

test("renders each icon variant", () => {
  assert.match(renderToStaticMarkup(<Icon name="arrow" direction="up" />), /svg/);
  assert.match(renderToStaticMarkup(<Icon name="arrow" direction="down" />), /svg/);
  assert.match(renderToStaticMarkup(<Icon name="search" />), /circle/);
  assert.match(renderToStaticMarkup(<Icon name="select" />), /M7 10L12 15L17 10/);
});

