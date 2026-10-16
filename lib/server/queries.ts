import "server-only";
import { db } from "./db";
import { POST_STATUSES, type PostStatus } from "@/lib/domain";
import { addDays, localDate, weekdayIndex, zonedToUtc } from "@/lib/tz";

export async function statusCounts(companyId: string) {
  const rows = await db.post.groupBy({ by: ["status"], where: { companyId }, _count: { _all: true } });
  const counts = Object.fromEntries(POST_STATUSES.map((s) => [s, 0])) as Record<PostStatus, number>;
  for (const r of rows) counts[r.status] = r._count._all;
  return counts;
}

/** UTC instant of 00:00 company-local on `dateKey`. */
export function startOfLocalDay(dateKey: string, tz: string): Date {
  const r = zonedToUtc(dateKey, "00:00", tz);
  // Midnight can be skipped by DST in a few zones; fall back to 01:00.
  return r.ok ? r.value : (zonedToUtc(dateKey, "01:00", tz) as { ok: true; value: Date }).value;
}

export function weekStartKey(now: Date, tz: string) {
  const today = localDate(now, tz);
  return addDays(today, -weekdayIndex(today));
}
