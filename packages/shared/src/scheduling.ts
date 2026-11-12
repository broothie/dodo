import { Temporal } from "@js-temporal/polyfill";

export type DueKind = "none" | "date" | "datetime";
export type Due =
  | { dueKind: "none"; dueAt: null; timeZone: null }
  | { dueKind: "date"; dueAt: string; timeZone: null }
  | { dueKind: "datetime"; dueAt: string; timeZone: string };
export const noDue: Due = { dueKind: "none", dueAt: null, timeZone: null };

export function isoInstant(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    throw new Error("Use an ISO timestamp with a timezone.");
  return Temporal.Instant.from(value).toString({ fractionalSecondDigits: 3 });
}
export function dateOnly(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Use a date in YYYY-MM-DD format.");
  Temporal.PlainDate.from(value, { overflow: "reject" });
  return value;
}
export function parseDue(value: unknown): Due {
  if (!value || typeof value !== "object")
    throw new Error("Expected a due date object.");
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) => !["dueKind", "dueAt", "timeZone"].includes(key),
    )
  )
    throw new Error("Unknown due date field.");
  if (
    body.dueKind === "none" &&
    body.dueAt === null &&
    (body.timeZone === null || body.timeZone === undefined)
  )
    return noDue;
  if (body.dueKind === "date") {
    if (body.timeZone != null)
      throw new Error("A date-only deadline has no timezone.");
    return { dueKind: "date", dueAt: dateOnly(body.dueAt), timeZone: null };
  }
  if (body.dueKind === "datetime") {
    if (
      typeof body.timeZone !== "string" ||
      !body.timeZone ||
      /^[+-]/.test(body.timeZone)
    )
      throw new Error("Choose a named timezone for a timed deadline.");
    new Intl.DateTimeFormat("en", { timeZone: body.timeZone });
    return {
      dueKind: "datetime",
      dueAt: isoInstant(body.dueAt),
      timeZone: body.timeZone,
    };
  }
  throw new Error("Choose none, date, or datetime for dueKind.");
}

export function dueFromLocal(
  date: string,
  time: string,
  timeZone: string,
): Due {
  if (!date && !time) return noDue;
  dateOnly(date);
  if (!time) return parseDue({ dueKind: "date", dueAt: date, timeZone: null });
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error("Use a time in HH:MM format.");
  const wall = Temporal.PlainDateTime.from(`${date}T${time}`);
  const zoned = wall.toZonedDateTime(timeZone, {
    disambiguation: "compatible",
  });
  // Reject spring-forward gaps instead of silently moving a deadline.
  if (!zoned.toPlainDateTime().equals(wall))
    throw new Error(
      "That local time does not exist because the clock moves forward.",
    );
  return parseDue({
    dueKind: "datetime",
    dueAt: zoned.toInstant().toString({ fractionalSecondDigits: 3 }),
    timeZone,
  });
}
export function localParts(due: Due) {
  if (due.dueKind === "none")
    return {
      date: "",
      time: "",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  if (due.dueKind === "date")
    return {
      date: due.dueAt,
      time: "",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  const wall = Temporal.Instant.from(due.dueAt).toZonedDateTimeISO(
    due.timeZone,
  );
  return {
    date: wall.toPlainDate().toString(),
    time: wall.toPlainTime().toString().slice(0, 5),
    timeZone: due.timeZone,
  };
}
export function formatDue(due: Due): string {
  if (due.dueKind === "none") return "";
  if (due.dueKind === "date")
    return Temporal.PlainDate.from(due.dueAt).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(due.dueAt));
}
