import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTaskInput } from "../packages/shared/src/index.ts";

test("task validation trims titles and rejects invalid input before persistence", () => {
  assert.deepEqual(parseTaskInput({ title: "  Task title  " }), {
    title: "Task title",
  });
  for (const input of [
    null,
    [],
    { title: "" },
    { title: " ".repeat(8) },
    { title: "x".repeat(301) },
    { title: "x", owner: "other" },
    { title: "x", completed: true },
    { title: "x", priority: "urgent" },
  ]) {
    assert.throws(() => parseTaskInput(input));
  }
});

test("completion accepts timestamps or explicit null and normalizes UTC", () => {
  assert.deepEqual(parseTaskInput({ completedAt: null }, true), {
    completedAt: null,
  });
  assert.deepEqual(
    parseTaskInput({ completedAt: "2026-11-11T10:00:00-08:00" }, true),
    { completedAt: "2026-11-11T18:00:00.000Z" },
  );
  assert.deepEqual(parseTaskInput({ title: "Rename" }, true), {
    title: "Rename",
  });
  for (const completedAt of [
    true,
    false,
    0,
    "",
    "yesterday",
    "2026-11-11",
    "2026-11-11T18:00:00",
    "2026-99-01T00:00:00Z",
    "2026-02-30T00:00:00Z",
  ]) {
    assert.throws(() => parseTaskInput({ completedAt }, true));
  }
  assert.throws(() => parseTaskInput({}, true));
  assert.throws(() => parseTaskInput({ title: null }, true));
});
