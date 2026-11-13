import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTaskText } from "../packages/shared/src/natural-language.ts";
import { dueFromLocal, noDue } from "../packages/shared/src/scheduling.ts";

const options = {
  now: new Date("2026-11-12T18:00:00Z"),
  timeZone: "America/Los_Angeles",
};

test("task dates support weekday/month names, relative days, aliases, and next Monday", () => {
  for (const [phrase, expected] of Object.entries({
    wed: "2026-11-18",
    "nov 1": "2027-11-01",
    tomorrow: "2026-11-13",
    today: "2026-11-12",
    tm: "2026-11-13",
    tmr: "2026-11-13",
    tmrw: "2026-11-13",
    "next week": "2026-11-16",
  })) {
    const input = `Walk the dog ${phrase}`;
    const parsed = parseTaskText(input, options);
    assert.equal(parsed.title, "Walk the dog", phrase);
    assert.deepEqual(
      parsed.due,
      { dueKind: "date", dueAt: expected, timeZone: null },
      phrase,
    );
    assert.equal(
      input.slice(parsed.matches[0].start, parsed.matches[0].end),
      phrase,
    );
  }
});

test("clock forms choose the next occurrence and respect explicit 24-hour and meridiem forms", () => {
  for (const [phrase, date, time] of [
    ["1:00", "2026-11-12", "13:00"],
    ["02:00", "2026-11-13", "02:00"],
    ["13:00", "2026-11-12", "13:00"],
    ["1p", "2026-11-12", "13:00"],
    ["1pm", "2026-11-12", "13:00"],
    ["1 o'clock", "2026-11-12", "13:00"],
    ["1 o’clock", "2026-11-12", "13:00"],
    ["12am", "2026-11-13", "00:00"],
    ["12pm", "2026-11-12", "12:00"],
    ["00:00", "2026-11-13", "00:00"],
    ["at 1:07 pm", "2026-11-12", "13:07"],
  ]) {
    const parsed = parseTaskText(`Call ${phrase}`, options);
    assert.equal(parsed.title, "Call", phrase);
    assert.deepEqual(
      parsed.due,
      dueFromLocal(date, time, options.timeZone),
      phrase,
    );
    assert.equal(parsed.error, undefined, phrase);
  }
  assert.deepEqual(
    parseTaskText("Call 1 o'clock", {
      ...options,
      now: new Date("2026-11-12T22:00:00Z"),
    }).due,
    dueFromLocal("2026-11-13", "01:00", options.timeZone),
  );
});

test("rightmost date and rightmost time win independently and all recognized phrases are extracted", () => {
  const text = "Call today at 1pm tomorrow at 2p";
  const parsed = parseTaskText(text, options);
  assert.equal(parsed.title, "Call");
  assert.deepEqual(
    parsed.due,
    dueFromLocal("2026-11-13", "14:00", options.timeZone),
  );
  assert.deepEqual(parsed.matches.map(match => text.slice(match.start, match.end)), ["tomorrow at 2p"]);
  assert.deepEqual(
    parseTaskText("Call tomorrow at 2pm today", options).due,
    dueFromLocal("2026-11-12", "14:00", options.timeZone),
  );
  assert.equal(parseTaskText("Call today and tomorrow", options).title, "Call");
  assert.equal(
    parseTaskText("Call tomorrow with Sam at 1pm", options).title,
    "Call with Sam",
  );
});

test("normal words, numbers, and invalid dates/times stay literal", () => {
  for (const title of [
    "Read chapter 1",
    "Buy 2 apples",
    "Call May",
    "TMNT",
    "Check 25:00",
    "Check 13:99",
    "Check Feb 30",
    "Review Nov 1-3",
  ]) {
    const parsed = parseTaskText(title, options);
    assert.equal(parsed.title, title, title);
    assert.deepEqual(parsed.due, noDue, title);
    assert.deepEqual(parsed.matches, [], title);
  }
});

test("removing phrases restores the base deadline, while changing date or time preserves the other component", () => {
  const base = dueFromLocal("2026-12-14", "15:30", options.timeZone);
  const context = { ...options, due: base };
  assert.deepEqual(parseTaskText("Call", context).due, base);
  const task = {
    ...base,
    id: "example",
    title: "Call",
    completedAt: null,
    createdAt: "2026-11-12T18:00:00Z",
    updatedAt: "2026-11-12T18:00:00Z",
  };
  assert.deepEqual(parseTaskText("Call", { ...options, due: task }).due, base);
  assert.deepEqual(
    parseTaskText("Call tomorrow", context).due,
    dueFromLocal("2026-11-13", "15:30", options.timeZone),
  );
  assert.deepEqual(
    parseTaskText("Call 1p", context).due,
    dueFromLocal("2026-12-14", "13:00", options.timeZone),
  );
});

test("all parsing uses the requested timezone, including a day boundary", () => {
  const parsed = parseTaskText("Call today 13:00", {
    ...options,
    timeZone: "Asia/Tokyo",
  });
  assert.deepEqual(
    parsed.due,
    dueFromLocal("2026-11-13", "13:00", "Asia/Tokyo"),
  );
  const prior = process.env.TZ;
  try {
    process.env.TZ = "Pacific/Auckland";
    assert.equal(parseTaskText("Call today", options).due.dueAt, "2026-11-12");
  } finally {
    if (prior === undefined) delete process.env.TZ;
    else process.env.TZ = prior;
  }
});

test("nonexistent local times report an error, rather than stripping a phrase or shifting the deadline", () => {
  const parsed = parseTaskText("Call March 8 2027 02:30", options);
  assert.equal(parsed.error, undefined);
  const gap = parseTaskText("Call March 14 2027 02:30", options);
  assert.match(gap.error ?? "", /does not exist/);
  assert.deepEqual(gap.due, noDue);
});

test("highlight offsets survive emoji and repeated phrases, and an all-date input has no fabricated title", () => {
  const text = "🐕 Walk tomorrow at 1p tomorrow";
  const parsed = parseTaskText(text, options);
  assert.equal(parsed.title, "🐕 Walk");
  assert.equal(
    text.slice(parsed.matches[0].start, parsed.matches[0].end),
    "at 1p tomorrow",
  );
  assert.equal(parseTaskText("tomorrow 1pm", options).title, "");
});

test("only the accepted time and date are underlined, including mixed clock forms and repeated text", () => {
  for (const [text, expected] of [
    ["Call 1pm 2pm", ["2pm"]],
    ["Call 1pm or 2pm", ["2pm"]],
    ["Call 1pm 13:00 at 2p", ["at 2p"]],
    ["Call 1pm 1pm", ["1pm"]],
    ["Call tomorrow at noon at 2pm", ["tomorrow", "at 2pm"]],
    ["Call at 2pm at midnight", ["at midnight"]],
    ["Call tomorrow at 2pm today", ["at 2pm today"]],
    ["🐕 Walk tomorrow and today at 1pm 2pm", ["today", "2pm"]],
  ] as const) {
    const parsed = parseTaskText(text, options);
    assert.deepEqual(parsed.matches.map(match => text.slice(match.start, match.end)), expected, text);
    if (text === "Call 1pm 1pm") assert.equal(parsed.matches[0].start, text.lastIndexOf("1pm"));
  }
});
