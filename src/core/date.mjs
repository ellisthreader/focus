const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_LABEL_OPTIONS = {
  weekday: "short",
  month: "short",
  day: "numeric"
};
const CLOCK_OPTIONS = {
  hour: "numeric",
  minute: "2-digit"
};

function validDate(value) {
  const date = typeof value === "string" && DATE_KEY_PATTERN.test(value)
    ? parseDateKey(value)
    : value instanceof Date
      ? new Date(value.getTime())
      : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("Expected a valid date");
  }
  return date;
}

function formatterArguments(localeOrOptions, defaults) {
  if (typeof localeOrOptions === "string" || Array.isArray(localeOrOptions)) {
    return [localeOrOptions, defaults];
  }

  const options = localeOrOptions && typeof localeOrOptions === "object"
    ? localeOrOptions
    : {};
  const { locale, ...formatOptions } = options;
  return [locale, { ...defaults, ...formatOptions }];
}

function assertFirstDay(firstDay) {
  if (!Number.isInteger(firstDay) || firstDay < 0 || firstDay > 6) {
    throw new RangeError("firstDay must be an integer from 0 (Sunday) to 6 (Saturday)");
  }
}

function civilDayNumber(value) {
  const date = validDate(value);
  return Math.floor(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ) / 86_400_000);
}

export function startOfDay(value = Date.now()) {
  const date = validDate(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfDay(value = Date.now()) {
  const date = validDate(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function dateKey(value = Date.now()) {
  const date = validDate(value);
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(key) {
  const match = DATE_KEY_PATTERN.exec(String(key));
  if (!match) {
    throw new RangeError("Date key must use YYYY-MM-DD");
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);

  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    throw new RangeError("Date key contains an invalid calendar date");
  }

  return date;
}

export function addDays(value, amount) {
  if (!Number.isInteger(amount)) {
    throw new RangeError("amount must be an integer");
  }

  const date = validDate(value);
  date.setDate(date.getDate() + amount);
  return date;
}

export function startOfWeek(value = Date.now(), firstDay = 1) {
  assertFirstDay(firstDay);
  const date = startOfDay(value);
  const offset = (date.getDay() - firstDay + 7) % 7;
  date.setDate(date.getDate() - offset);
  return date;
}

export function daysInMonthGrid(value = Date.now(), firstDay = 1) {
  assertFirstDay(firstDay);
  const date = validDate(value);
  date.setDate(1);
  const firstGridDay = startOfWeek(date, firstDay);

  return Array.from({ length: 42 }, (_, index) => addDays(firstGridDay, index));
}

export function isSameDay(left, right) {
  return dateKey(left) === dateKey(right);
}

export function formatDayLabel(value, localeOrOptions) {
  const args = formatterArguments(localeOrOptions, DAY_LABEL_OPTIONS);
  return new Intl.DateTimeFormat(...args).format(validDate(value));
}

export function formatClock(value, localeOrOptions) {
  const args = formatterArguments(localeOrOptions, CLOCK_OPTIONS);
  return new Intl.DateTimeFormat(...args).format(validDate(value));
}

export function formatDurationMinutes(value) {
  const minutes = Math.max(0, Math.round(Number(value)));
  if (!Number.isFinite(minutes)) {
    return "0m";
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes}m`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

export function relativeDayLabel(value, reference = Date.now(), localeOrOptions) {
  const difference = civilDayNumber(value) - civilDayNumber(reference);

  if (difference === 0) return "Today";
  if (difference === -1) return "Yesterday";
  if (difference === 1) return "Tomorrow";
  return formatDayLabel(value, localeOrOptions);
}

export function clamp(value, min, max) {
  const number = Number(value);
  const lower = Number(min);
  const upper = Number(max);

  if (![number, lower, upper].every(Number.isFinite)) {
    throw new TypeError("clamp expects finite numbers");
  }
  if (lower > upper) {
    throw new RangeError("min cannot be greater than max");
  }

  return Math.min(upper, Math.max(lower, number));
}
