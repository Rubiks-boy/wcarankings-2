import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PwaRegistration,
  PwaUpdatePrompt,
} from "./PwaRegistration";

test("does not render visible UI before an update is ready", () => {
  assert.equal(renderToStaticMarkup(<PwaRegistration />), "");
});

test("renders an accessible update prompt", () => {
  const markup = renderToStaticMarkup(
    <PwaUpdatePrompt
      updating={false}
      onRefresh={() => undefined}
      onDismiss={() => undefined}
    />,
  );

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /Update available/);
  assert.match(markup, />Refresh</);
  assert.match(markup, />Later</);
});

test("shows progress while the waiting worker activates", () => {
  const markup = renderToStaticMarkup(
    <PwaUpdatePrompt
      updating
      onRefresh={() => undefined}
      onDismiss={() => undefined}
    />,
  );

  assert.match(markup, /Updating…/);
  assert.match(markup, /disabled/);
});
