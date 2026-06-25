import test from "node:test";
import assert from "node:assert/strict";

import {
  addDays,
  clamp,
  dateKey,
  daysInMonthGrid,
  endOfDay,
  formatClock,
  formatDayLabel,
  formatDurationMinutes,
  isSameDay,
  parseDateKey,
  relativeDayLabel,
  startOfDay,
  startOfWeek
} from "../src/core/date.mjs";

function localDate(year, month, day, hour = 12, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

test("startOfDay and endOfDay preserve the local calendar date", () => {
  const input = localDate(2026, 6, 7, 14, 35);
  const start = startOfDay(input);
  const end = endOfDay(input);

  assert.equal(dateKey(start), "2026-06-07");
  assert.deepEqual(
    [start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds()],
    [0, 0, 0, 0]
  );
  assert.deepEqual(
    [end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds()],
    [23, 59, 59, 999]
  );
  assert.equal(input.getHours(), 14, "helpers do not mutate their input");
});

test("dateKey and parseDateKey round-trip in local time", () => {
  const parsed = parseDateKey("2024-02-29");

  assert.equal(dateKey(parsed), "2024-02-29");
  assert.deepEqual(
    [parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), parsed.getHours()],
    [2024, 1, 29, 0]
  );
});

test("parseDateKey rejects malformed and impossible dates", () => {
  for (const key of ["2026-6-07", "2026-02-29", "2026-13-01", "not-a-date"]) {
    assert.throws(() => parseDateKey(key), RangeError);
  }
});

test("addDays uses calendar arithmetic and does not mutate the input", () => {
  const input = localDate(2024, 2, 28, 9, 15);
  const result = addDays(input, 2);

  assert.equal(dateKey(result), "2024-03-01");
  assert.equal(result.getHours(), 9);
  assert.equal(dateKey(input), "2024-02-28");
  assert.throws(() => addDays(input, 1.5), RangeError);
});

test("startOfWeek supports Monday and Sunday week starts", () => {
  const wednesday = localDate(2026, 6, 10);

  assert.equal(dateKey(startOfWeek(wednesday, 1)), "2026-06-08");
  assert.equal(dateKey(startOfWeek(wednesday, 0)), "2026-06-07");
  assert.throws(() => startOfWeek(wednesday, 7), RangeError);
});

test("daysInMonthGrid returns six complete weeks from the configured first day", () => {
  const mondayGrid = daysInMonthGrid(localDate(2026, 6, 15), 1);
  const sundayGrid = daysInMonthGrid(localDate(2026, 6, 15), 0);

  assert.equal(mondayGrid.length, 42);
  assert.equal(dateKey(mondayGrid[0]), "2026-06-01");
  assert.equal(dateKey(mondayGrid.at(-1)), "2026-07-12");
  assert.equal(mondayGrid[0].getDay(), 1);
  assert.equal(sundayGrid[0].getDay(), 0);
  assert.notEqual(mondayGrid[0], mondayGrid[1]);
});

test("isSameDay compares local civil dates", () => {
  assert.equal(
    isSameDay(localDate(2026, 6, 7, 1), localDate(2026, 6, 7, 23)),
    true
  );
  assert.equal(
    isSameDay(localDate(2026, 6, 7, 23), localDate(2026, 6, 8, 1)),
    false
  );
});

test("date and clock labels support deterministic locale options", () => {
  const input = localDate(2026, 6, 7, 9, 5);

  assert.equal(
    formatDayLabel(input, { locale: "en-US", timeZone: "UTC" }),
    new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    }).format(input)
  );
  assert.equal(
    formatClock(input, { locale: "en-GB", hour12: false }),
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: false
    }).format(input)
  );
});

test("formatDurationMinutes produces compact, non-negative labels", () => {
  assert.equal(formatDurationMinutes(0), "0m");
  assert.equal(formatDurationMinutes(45), "45m");
  assert.equal(formatDurationMinutes(60), "1h");
  assert.equal(formatDurationMinutes(90), "1h 30m");
  assert.equal(formatDurationMinutes(-10), "0m");
  assert.equal(formatDurationMinutes(Number.NaN), "0m");
});

test("relativeDayLabel identifies adjacent local dates", () => {
  const reference = localDate(2026, 6, 7, 23);

  assert.equal(relativeDayLabel(localDate(2026, 6, 7, 1), reference), "Today");
  assert.equal(relativeDayLabel(localDate(2026, 6, 6), reference), "Yesterday");
  assert.equal(relativeDayLabel(localDate(2026, 6, 8), reference), "Tomorrow");
  assert.equal(
    relativeDayLabel(localDate(2026, 6, 9), reference, { locale: "en-US" }),
    "Tue, Jun 9"
  );
});

test("clamp constrains finite values and validates its bounds", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-2, 0, 10), 0);
  assert.equal(clamp(12, 0, 10), 10);
  assert.equal(clamp("4", 0, 10), 4);
  assert.throws(() => clamp(Number.NaN, 0, 10), TypeError);
  assert.throws(() => clamp(5, 10, 0), RangeError);
});
