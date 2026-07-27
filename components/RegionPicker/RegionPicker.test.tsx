import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RegionPicker } from "./RegionPicker";

test("renders the selected region input", () => {
  const markup = renderToStaticMarkup(
    <RegionPicker
      options={[{ key: "world", scope: "world", regionId: "", label: "World" }]}
      selected={{ scope: "world", regionId: "" }}
      onChange={() => undefined}
    />,
  );
  assert.match(markup, /aria-label="Region"/);
  assert.match(markup, /value="World"/);
});
