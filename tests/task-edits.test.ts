import assert from "node:assert/strict";
import test from "node:test";
import { noDue, type Task } from "@dodo/shared";
import { parseTaskText, type ParsedTaskText } from "@dodo/shared/natural-language";
import { planTaskEdit } from "../apps/app/src/lib/task-edits.ts";

const task: Task = {
  ...noDue, id: "task", title: "Call at 9am", completedAt: null, deletedAt: null,
  createdAt: "2026-11-13T18:00:00.000Z", updatedAt: "2026-11-13T18:00:00.000Z",
};
const now = new Date("2026-11-13T18:00:00.000Z");
const parse = (text: string) => parseTaskText(text, { now, timeZone: "America/Los_Angeles", due: task });

test("unchanged saved date/time words stay literal and need no update", () => {
  const parsed = parseTaskText(task.title, {
    now, due: task, literalRanges: [{ start: 0, end: task.title.length }],
  });
  assert.deepEqual(planTaskEdit(task, task.title, parsed), { kind: "unchanged" });
});

test("title-only edits preserve the deadline and completion by omitting those patch fields", () => {
  const dated: Task = { ...task, dueKind: "date", dueAt: "2026-12-14", timeZone: null, completedAt: now.toISOString() };
  const parsed: ParsedTaskText = { title: "Renamed", due: dated, matches: [] };
  assert.deepEqual(planTaskEdit(dated, "Renamed", parsed), { kind: "update", patch: { title: "Renamed" } });
  assert.equal(dated.title, task.title, "Planning must not mutate the saved task");
});

test("only accepted NLP expressions schedule an edit; earlier expressions remain in its title", () => {
  const text = "Call 9am tomorrow 2pm";
  const parsed = parse(text);
  const plan = planTaskEdit(task, text, parsed);
  assert.deepEqual(plan, { kind: "update", patch: { title: "Call 9am", dueKind: "datetime", dueAt: "2026-11-14T22:00:00.000Z", timeZone: "America/Los_Angeles" } });
});

test("an empty blur deletes, but Enter rejects an empty or date-only title", () => {
  for (const text of ["", "   "]) {
    assert.deepEqual(planTaskEdit(task, text, parse(text), true), { kind: "delete" });
    assert.equal(planTaskEdit(task, text, parse(text)).kind, "invalid");
  }
  for (const deleteEmpty of [false, true])
    assert.deepEqual(planTaskEdit(task, "tomorrow", parse("tomorrow"), deleteEmpty), {
      kind: "invalid", message: "Add a task title as well as a deadline.",
    });
});

test("invalid local clock times leave the draft available instead of extracting or saving it", () => {
  const parsed = parseTaskText("Call March 14 2027 02:30", { now, timeZone: "America/Los_Angeles" });
  assert.ok(parsed.error, "The spring DST gap must be rejected");
  assert.deepEqual(planTaskEdit(task, "Call March 14 2027 02:30", parsed), { kind: "invalid", message: parsed.error });
});
