import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PwaRegistration } from "./PwaRegistration";

test("does not render visible UI before an update is ready", () => {
  assert.equal(renderToStaticMarkup(<PwaRegistration />), "");
});
