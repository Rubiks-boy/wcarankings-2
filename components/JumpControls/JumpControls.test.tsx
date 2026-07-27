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
