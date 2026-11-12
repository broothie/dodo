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
