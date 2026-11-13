import assert from "node:assert/strict";
import test from "node:test";
import { isEmptyBackspace } from "../apps/app/src/lib/task-keyboard.ts";

test("empty-task deletion requires a fresh Backspace on an editable empty title", () => {
  const empty = { key: "Backspace", text: "" };
  assert.equal(isEmptyBackspace(empty), true);
  assert.equal(isEmptyBackspace({ ...empty, text: " \t " }), true);
  for (const event of [
    { ...empty, text: "a" },
    { ...empty, text: "tomorrow 1pm" },
    { ...empty, key: "Delete" },
    { ...empty, key: "Enter" },
    { ...empty, repeat: true },
    { ...empty, isComposing: true },
    { ...empty, keyCode: 229 },
    { ...empty, readOnly: true },
    { ...empty, disabled: true },
  ]) assert.equal(isEmptyBackspace(event), false, JSON.stringify(event));
});
