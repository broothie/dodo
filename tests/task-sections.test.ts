import assert from "node:assert/strict";
import test from "node:test";
import { groupTasksByDate, insertTaskAfter } from "../apps/app/src/lib/task-sections.ts";
import { noDue, type Due } from "../packages/shared/src/scheduling.ts";

function task(id: string, due: Due = noDue, completedAt: string | null = null) {
  return { id, title: id, ...due, completedAt, deletedAt: null, createdAt: "2026-11-01T12:00:00.000Z", updatedAt: "2026-11-01T12:00:00.000Z" };
}
const date = (dueAt: string): Due => ({ dueKind: "date", dueAt, timeZone: null });
const time = (dueAt: string): Due => ({ dueKind: "datetime", dueAt, timeZone: "Asia/Tokyo" });

test("date sections run earliest first, then undated tasks and completed tasks", () => {
  const tasks = [task("no-date"), task("later", date("2026-11-14")),
    task("completed", date("2026-10-01"), "2026-11-13T12:00:00Z"), task("early", date("2026-11-12"))];
  const sections = groupTasksByDate(tasks, new Date(2026, 10, 13, 12));
  assert.deepEqual(sections.map(section => section.title), ["Yesterday", "Tomorrow", "No date", "Completed"]);
  assert.deepEqual(sections.flatMap(section => section.data.map(task => task.id)), ["early", "later", "no-date", "completed"]);
  assert.deepEqual(tasks.map(task => task.id), ["no-date", "later", "completed", "early"]);
  assert.deepEqual(groupTasksByDate([]), []);
});

test("dates stay literal while instants group by the viewer's day and sort by time", () => {
  const previousZone = process.env.TZ;
  try {
    process.env.TZ = "America/Los_Angeles";
    const sections = groupTasksByDate([
      task("late", time("2026-11-14T04:00:00Z")), // Nov 13, 8pm locally
      task("all-day", date("2026-11-13")),
      task("early", time("2026-11-13T17:00:00Z")), // Nov 13, 9am locally
      task("midnight", time("2026-11-14T08:00:00Z")),
    ], new Date("2026-11-13T20:00:00Z"));
    assert.deepEqual(sections.map(section => section.title), ["Today", "Tomorrow"]);
    assert.deepEqual(sections[0].data.map(task => task.id), ["all-day", "early", "late"]);
    assert.equal(sections[1].data[0].id, "midnight");
  } finally {
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  }
});

test("DST overlaps sort by actual instant, and relative section labels cross year boundaries", () => {
  const previousZone = process.env.TZ;
  try {
    process.env.TZ = "America/Los_Angeles";
    const sections = groupTasksByDate([
      task("second", time("2026-11-01T09:15:00Z")),
      task("first", time("2026-11-01T08:45:00Z")),
    ], new Date("2026-11-01T20:00:00Z"));
    assert.equal(sections[0].title, "Today");
    assert.deepEqual(sections[0].data.map(task => task.id), ["first", "second"]);
    const year = groupTasksByDate([task("next", date("2027-01-01")), task("old", date("2025-01-01"))], new Date(2026, 11, 31, 12));
    assert.match(year[0].title, /2025/);
    assert.equal(year[1].title, "Tomorrow");
  } finally {
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  }
});

test("completed tasks sort by completion and reopen into their date section", () => {
  const older = task("older", noDue, "2026-11-12T12:00:00Z");
  const recent = task("recent", date("2026-11-13"), "2026-11-13T12:00:00Z");
  const now = new Date(2026, 10, 13, 12);
  assert.deepEqual(groupTasksByDate([older, recent], now)[0].data.map(task => task.id), ["recent", "older"]);
  const reopened = groupTasksByDate([older, { ...recent, completedAt: null }], now);
  assert.deepEqual(reopened.map(section => section.title), ["Today", "Completed"]);
});

test("inline insertion stays below its anchor within matching deadlines and undated tasks", () => {
  for (const due of [noDue, date("2026-11-13"), time("2026-11-13T21:00:00Z")]) {
    const first = task("first", due);
    const last = task("last", due);
    const inserted = { ...task("inserted", due), createdAt: "2026-11-13T20:00:00Z" };
    const original = [first, last];
    const list = insertTaskAfter(original, inserted, first.id);
    assert.deepEqual(list.map(item => item.id), ["first", "inserted", "last"]);
    assert.deepEqual(groupTasksByDate(list)[0].data.map(item => item.id), ["first", "inserted", "last"]);
    assert.deepEqual(original.map(item => item.id), ["first", "last"]);
    assert.equal(insertTaskAfter(original, inserted, null)[0].id, "inserted");
    assert.equal(insertTaskAfter(original, inserted, "missing")[0].id, "inserted");
  }
});
