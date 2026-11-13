import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDue,
  dueFromLocal,
  localParts,
  noDue,
  formatDue,
} from "../packages/shared/src/scheduling.ts";
import { parseTaskInput } from "../packages/shared/src/index.ts";

test("date-only deadlines never become instants; midnight is explicitly timed", () => {
  const date = parseDue({ dueKind: "date", dueAt: "2026-12-14" });
  assert.deepEqual(date, {
    dueKind: "date",
    dueAt: "2026-12-14",
    timeZone: null,
  });
  const midnight = dueFromLocal("2026-12-14", "00:00", "Asia/Tokyo");
  assert.deepEqual(midnight, {
    dueKind: "datetime",
    dueAt: "2026-12-13T15:00:00.000Z",
    timeZone: "Asia/Tokyo",
  });
  assert.deepEqual(localParts(midnight), {
    date: "2026-12-14",
    time: "00:00",
    timeZone: "Asia/Tokyo",
  });
  const oldZone = process.env.TZ;
  try {
    process.env.TZ = "Pacific/Honolulu";
    assert.equal(localParts(date).date, "2026-12-14");
    assert.match(formatDue(date), /14/);
  } finally {
    if (oldZone === undefined) delete process.env.TZ;
    else process.env.TZ = oldZone;
  }
});
test("clearing due dates is explicit and patches require a complete due value", () => {
  assert.deepEqual(dueFromLocal("", "", "UTC"), noDue);
  assert.deepEqual(parseTaskInput({ ...noDue }, true), noDue);
  assert.deepEqual(parseTaskInput({ title: "Rename" }, true), {
    title: "Rename",
  });
  for (const value of [
    { dueAt: "2026-12-14" },
    { dueKind: "date", dueAt: "2026-02-30" },
    { dueKind: "date", dueAt: "2026-12-14T00:00:00Z" },
    { dueKind: "date", dueAt: "2026-12-14", timeZone: "UTC" },
    { dueKind: "datetime", dueAt: "2026-12-14", timeZone: "UTC" },
    { dueKind: "datetime", dueAt: "2026-12-14T00:00:00Z" },
    {
      dueKind: "datetime",
      dueAt: "2026-12-14T00:00:00Z",
      timeZone: "No/Such_Zone",
    },
    { dueKind: "none", dueAt: "2026-12-14" },
  ])
    assert.throws(() => parseTaskInput(value, true));
});
test("local time conversion rejects DST gaps and consistently chooses earlier overlap", () => {
  assert.throws(() =>
    dueFromLocal("2026-03-08", "02:30", "America/Los_Angeles"),
  );
  assert.equal(
    dueFromLocal("2026-11-01", "01:30", "America/Los_Angeles").dueAt,
    "2026-11-01T08:30:00.000Z",
  );
  assert.throws(() => dueFromLocal("", "12:00", "UTC"));
  assert.throws(() => dueFromLocal("2026-12-14", "24:00", "UTC"));
});

test("deadline chips use relative days, time-only today, and years only outside the current year", () => {
  const now = new Date(2026, 10, 12, 12);
  assert.equal(formatDue(noDue, now), "");
  assert.equal(formatDue(parseDue({ dueKind: "date", dueAt: "2026-11-12" }), now), "Today");
  assert.equal(formatDue(parseDue({ dueKind: "date", dueAt: "2026-11-11" }), now), "Yesterday");
  assert.doesNotMatch(formatDue(parseDue({ dueKind: "date", dueAt: "2026-11-14" }), now), /2026/);
  assert.match(formatDue(parseDue({ dueKind: "date", dueAt: "2027-11-14" }), now), /2027/);
  const timed = (date: Date) => parseDue({ dueKind: "datetime", dueAt: date.toISOString(), timeZone: "UTC" });
  const today = new Date(2026, 10, 12, 13);
  assert.equal(formatDue(timed(today), now), "1pm");
  assert.equal(formatDue(timed(new Date(2026, 10, 12, 13, 30)), now), "1:30pm");
  assert.equal(formatDue(timed(new Date(2026, 10, 12, 0)), now), "12am");
  assert.equal(formatDue(timed(new Date(2026, 10, 12, 12)), now), "12pm");
  assert.equal(formatDue(timed(new Date(2026, 10, 11, 13)), now), "Yesterday, 1pm");
  assert.equal(formatDue(parseDue({ dueKind: "date", dueAt: "2026-11-13" }), now), "Tomorrow");
  assert.equal(formatDue(timed(new Date(2026, 10, 13, 13)), now), "Tomorrow, 1pm");
  assert.doesNotMatch(formatDue(timed(new Date(2026, 10, 14, 13)), now), /2026/);
  assert.match(formatDue(timed(new Date(2027, 10, 14, 13)), now), /2027/);
});

test("relative deadlines follow the display timezone and calendar days across DST and year boundaries", () => {
  const oldZone = process.env.TZ;
  try {
    process.env.TZ = "America/Los_Angeles";
    const timed = (dueAt: string) => parseDue({ dueKind: "datetime", dueAt, timeZone: "Asia/Tokyo" });
    assert.equal(formatDue(timed("2026-11-13T03:00:00Z"), new Date("2026-11-13T04:00:00Z")), "7pm");
    assert.equal(formatDue(timed("2026-11-01T07:30:00Z"), new Date("2026-11-02T08:30:00Z")), "Yesterday, 12:30am");
    assert.doesNotMatch(formatDue(timed("2027-01-01T01:00:00Z"), new Date("2026-12-01T20:00:00Z")), /2026|2027/);
    assert.equal(formatDue(parseDue({ dueKind: "date", dueAt: "2025-12-31" }), new Date(2026, 0, 1)), "Yesterday");
    assert.equal(formatDue(timed("2026-03-09T07:30:00Z"), new Date("2026-03-08T08:30:00Z")), "Tomorrow, 12:30am");
    assert.equal(formatDue(parseDue({ dueKind: "date", dueAt: "2027-01-01" }), new Date(2026, 11, 31)), "Tomorrow");
  } finally {
    if (oldZone === undefined) delete process.env.TZ;
    else process.env.TZ = oldZone;
  }
});

test("time-only chips omit dates on every day and preserve compact local clock formatting", () => {
  const previousZone = process.env.TZ;
  try {
    process.env.TZ = "America/Los_Angeles";
    const now = new Date("2026-11-13T20:00:00Z");
    const timed = (dueAt: string) => parseDue({ dueKind: "datetime", dueAt, timeZone: "Asia/Tokyo" });
    assert.equal(formatDue(timed("2026-11-14T21:00:00Z"), now, { showDate: false }), "1pm");
    assert.equal(formatDue(timed("2027-01-01T21:30:00Z"), now, { showDate: false }), "1:30pm");
    assert.equal(formatDue(timed("2026-11-12T08:00:00Z"), now, { showDate: false }), "12am");
    assert.equal(formatDue(parseDue({ dueKind: "date", dueAt: "2026-11-14" }), now, { showDate: false }), "");
    assert.equal(formatDue(noDue, now, { showDate: false }), "");
    assert.equal(formatDue(timed("2026-11-14T21:00:00Z"), now, { showDate: true }), "Tomorrow, 1pm");
  } finally {
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  }
});
