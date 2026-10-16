// Timezone helpers built on Intl so no timezone database dependency is needed.
// All persisted times are UTC; company-local wall time is used only for input and display.

import { DATE_RE, TIME_RE } from "./domain";

function partsInZone(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** Offset of `timeZone` from UTC at `date`, in milliseconds (positive east of UTC). */
function offsetMs(date: Date, timeZone: string): number {
  const p = partsInZone(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a wall-clock date ("YYYY-MM-DD") and time ("HH:mm") in `timeZone` to a UTC Date.
 * Returns an error for malformed input or for local times skipped by a DST change.
 */
export function zonedToUtc(
  date: string,
  time: string,
  timeZone: string,
): { ok: true; value: Date } | { ok: false; error: string } {
  if (!DATE_RE.test(date)) return { ok: false, error: "Enter a date as YYYY-MM-DD." };
  if (!TIME_RE.test(time)) return { ok: false, error: "Enter a time as HH:mm (24-hour)." };
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const check = new Date(guess);
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return { ok: false, error: "That date does not exist." };
  }
  let utc = guess - offsetMs(new Date(guess), timeZone);
  const second = guess - offsetMs(new Date(utc), timeZone);
  if (second !== utc) utc = second;
  const result = new Date(utc);
  if (localDate(result, timeZone) !== date || localTime(result, timeZone) !== time) {
    return { ok: false, error: `${time} does not exist on ${date} in ${timeZone} (daylight-saving change).` };
  }
  return { ok: true, value: result };
}

/** "YYYY-MM-DD" of `date` in `timeZone`. */
export function localDate(date: Date, timeZone: string): string {
  const p = partsInZone(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "HH:mm" of `date` in `timeZone`. */
export function localTime(date: Date, timeZone: string): string {
  const p = partsInZone(date, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "Sat 17 Oct 2026, 09:00" in `timeZone`, deterministic across runtimes. */
export function formatDateTime(date: Date, timeZone: string): string {
  const key = localDate(date, timeZone);
  return `${formatShortDate(key)} ${key.slice(0, 4)}, ${localTime(date, timeZone)}`;
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sat 17 Oct" — formatted by hand so server and browser render identical text (no ICU differences). */
export function formatShortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return `${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MON[m - 1]}`;
}

/** Add whole days to a "YYYY-MM-DD" key (calendar arithmetic, timezone-independent). */
export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function timeZones(): string[] {
  return ["UTC", ...Intl.supportedValuesOf("timeZone").filter((z) => z !== "UTC")];
}
