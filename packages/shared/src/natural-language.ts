import * as chrono from "chrono-node/en";
import { Temporal } from "@js-temporal/polyfill";
import { dueFromLocal, noDue, type Due } from "@dodo/shared/scheduling";

export type TextRange = { start: number; end: number };
type Candidate = TextRange & {
  date?: string;
  hours?: number[];
  minute?: number;
};
export type ParsedTaskText = {
  title: string;
  due: Due;
  /** Only the date/time expressions that determine the resulting deadline. */
  matches: TextRange[];
  error?: string;
};
export type ParseTaskOptions = { now?: Date; timeZone?: string; due?: Due };

function mergeRanges(candidates: TextRange[], text: string): TextRange[] {
  const ranges: TextRange[] = [];
  for (const candidate of candidates) {
    const previous = ranges.at(-1);
    if (previous && /^\s*(?:(?:and|or)|,)?\s*$/i.test(text.slice(previous.end, candidate.start))) {
      previous.end = candidate.end;
    } else ranges.push({ start: candidate.start, end: candidate.end });
  }
  return ranges;
}

function hoursFor(hour: number, marker?: string, leadingZero = false) {
  if (marker) {
    if (hour < 1 || hour > 12) return null;
    return [(hour % 12) + (marker.toLowerCase() === "p" ? 12 : 0)];
  }
  if (hour > 23) return null;
  return leadingZero || hour === 0 || hour > 12
    ? [hour]
    : [hour % 12, (hour % 12) + 12];
}

/** English task deadlines, resolved in the user's timezone. No network calls. */
export function parseTaskText(
  text: string,
  options: ParseTaskOptions = {},
): ParsedTaskText {
  const base: Due = options.due
    ? ({
        dueKind: options.due.dueKind,
        dueAt: options.due.dueAt,
        timeZone: options.due.timeZone,
      } as Due)
    : noDue;
  const timeZone =
    options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const instant = Temporal.Instant.from(
    (options.now ?? new Date()).toISOString(),
  );
  const now = instant.toZonedDateTimeISO(timeZone);
  const today = now.toPlainDate();
  const candidates: Candidate[] = [];
  let masked = text;
  const mask = (range: TextRange) => {
    masked =
      masked.slice(0, range.start) +
      " ".repeat(range.end - range.start) +
      masked.slice(range.end);
  };
  // Explicit clock forms avoid interpreting ordinary quantities as deadlines.
  const clocks = [
    /\b(?:at\s+)?(\d{1,2}):(\d{2})(?:\s*([ap])(?:\.?m\.?)?)?(?![\w:])/gi,
    /\b(?:at\s+)?(\d{1,2})\s*([ap])(?:\.?m\.?)?(?!\w)/gi,
    /\b(?:at\s+)?(\d{1,2})\s+o['’]?clock(?:\s*([ap])(?:\.?m\.?)?)?(?!\w)/gi,
  ];
  // Split named clocks from dates too, so an overridden "noon" cannot stay
  // underlined as part of a date phrase such as "tomorrow at noon".
  for (const match of masked.matchAll(/\b(?:at\s+)?(noon|midnight)\b/gi)) {
    const candidate = {
      start: match.index,
      end: match.index + match[0].length,
      hours: [match[1].toLowerCase() === "noon" ? 12 : 0],
      minute: 0,
    };
    candidates.push(candidate);
    mask(candidate);
  }
  for (const [patternIndex, pattern] of clocks.entries()) {
    for (const match of masked.matchAll(pattern)) {
      const hour = Number(match[1]);
      const minute = patternIndex === 0 ? Number(match[2]) : 0;
      const marker = match[patternIndex === 0 ? 3 : 2];
      const hours = hoursFor(hour, marker, match[1].startsWith("0"));
      if (!hours || minute > 59) continue;
      const candidate = {
        start: match.index,
        end: match.index + match[0].length,
        hours,
        minute,
      };
      candidates.push(candidate);
      mask(candidate);
    }
  }
  for (const match of masked.matchAll(
    /\b(?:on\s+)?(?:tm|tmr|tmrw|next\s+week)\b/gi,
  )) {
    const nextWeek = /next/i.test(match[0]);
    const date = today
      .add({ days: nextWeek ? 8 - today.dayOfWeek : 1 })
      .toString();
    const candidate = {
      start: match.index,
      end: match.index + match[0].length,
      date,
    };
    candidates.push(candidate);
    mask(candidate);
  }
  const reference = {
    instant: new Date(instant.epochMilliseconds),
    timezone: now.offsetNanoseconds / 60e9,
  };
  for (const result of chrono.parse(masked, reference, { forwardDate: true })) {
    // Chrono ranges and timezone-qualified results need richer scheduling semantics.
    if (result.end || result.start.isCertain("timezoneOffset")) continue;
    const part = result.start;
    const candidate: Candidate = {
      start: result.index,
      end: result.index + result.text.length,
    };
    if (part.isCertain("day") || part.isCertain("weekday")) {
      if (
        /^(?:on\s+)?(?:sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\.?$/i.test(
          result.text,
        )
      ) {
        candidate.date = today
          .add({ days: (part.get("weekday")! - (today.dayOfWeek % 7) + 7) % 7 })
          .toString();
      } else {
        try {
          candidate.date = Temporal.PlainDate.from(
            {
              year: part.get("year")!,
              month: part.get("month")!,
              day: part.get("day")!,
            },
            { overflow: "reject" },
          ).toString();
        } catch {
          continue;
        }
      }
    }
    if (part.isCertain("hour")) {
      const hour = part.get("hour")!;
      candidate.hours = part.isCertain("meridiem")
        ? [hour]
        : (hoursFor(hour) ?? undefined);
      candidate.minute = part.get("minute") ?? 0;
    }
    if (candidate.date || candidate.hours) candidates.push(candidate);
  }
  candidates.sort((a, b) => a.start - b.start);
  if (!candidates.length) return { title: text.trim(), due: base, matches: [] };
  const dateCandidate = candidates.filter((candidate) => candidate.date).at(-1);
  const timeCandidate = candidates.filter((candidate) => candidate.hours).at(-1);
  const matches = mergeRanges(candidates.filter(candidate => candidate === dateCandidate || candidate === timeCandidate), text);
  // Continue extracting all scheduling phrases, but underline only the winners.
  // Retaining overridden phrases would parse them again on the next edit.
  const extractionRanges = mergeRanges(candidates, text);
  let title = text;
  for (const match of [...extractionRanges].reverse())
    title = title.slice(0, match.start) + " " + title.slice(match.end);
  title = title
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();
  let date = dateCandidate?.date;
  let time = "";
  if (base.dueKind === "date") date ??= base.dueAt;
  if (base.dueKind === "datetime") {
    const wall = Temporal.Instant.from(base.dueAt).toZonedDateTimeISO(timeZone);
    date ??= wall.toPlainDate().toString();
    time = wall.toPlainTime().toString().slice(0, 5);
  }
  try {
    if (timeCandidate) {
      const hasDate = !!date;
      let day = Temporal.PlainDate.from(date ?? today);
      const times = timeCandidate
        .hours!.map((hour) =>
          Temporal.PlainTime.from({ hour, minute: timeCandidate.minute ?? 0 }),
        )
        .sort(Temporal.PlainTime.compare);
      let chosen = times.find(
        (time) =>
          Temporal.PlainDateTime.compare(
            day.toPlainDateTime(time),
            now.toPlainDateTime(),
          ) >= 0,
      );
      if (!chosen && !hasDate) {
        day = day.add({ days: 1 });
        chosen = times[0];
      }
      chosen ??= times.at(-1)!;
      date = day.toString();
      time = chosen.toString().slice(0, 5);
    }
    return {
      title,
      due: dueFromLocal(date ?? today.toString(), time, timeZone),
      matches,
    };
  } catch (error) {
    return {
      title,
      due: base,
      matches,
      error:
        error instanceof Error
          ? error.message
          : "Could not parse that deadline.",
    };
  }
}
