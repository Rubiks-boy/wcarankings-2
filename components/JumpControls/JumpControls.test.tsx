import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JumpControls } from "./JumpControls";

test("renders a jump action with a useful label", () => {
  const markup = renderToStaticMarkup(
    <JumpControls
      direction="down"
      visible
      armed={false}
      currentPosition={100}
      total={10_000}
      onJump={() => undefined}
    />,
  );
  assert.match(markup, /Jump 5,000/);
  assert.match(markup, /Jump--down/);
});

test("groups the upper jump and search actions in one rail", () => {
  const markup = renderToStaticMarkup(
    <JumpControls
      direction="up"
      visible
      armed={false}
      currentPosition={10_000}
      total={20_000}
      onJump={() => undefined}
      searchControl={<button type="button">Search</button>}
      searchActive
      eventIcon="333"
      eventLabel="3x3x3 Cube, Single"
      eventOptions={[{ id: "333", name: "3x3x3 Cube" }]}
      onEventChange={() => undefined}
    />,
  );
  assert.match(markup, /class="Jump-rail(?: [^"]+)?"/);
  assert.match(markup, /Jump 5,000/);
  assert.match(markup, /cubing-icon event-333/);
  assert.match(markup, /aria-label="3x3x3 Cube, Single"/);
  assert.match(markup, /aria-haspopup="listbox"/);
  assert.match(markup, />Search<\/button>/);
});

test("splits the lower search rail between previous and next people", () => {
  const markup = renderToStaticMarkup(
    <JumpControls
      direction="down"
      visible
      armed={false}
      currentPosition={100}
      total={10_000}
      onJump={() => undefined}
      searchActive
      onSearchPrevious={() => undefined}
      onSearchNext={() => undefined}
    />,
  );

  assert.match(markup, /Jump-rail--searchNavigation/);
  assert.match(markup, /Previous person/);
  assert.match(markup, /Next person/);
});
