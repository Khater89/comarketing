import { timingSafeEqual } from "node:crypto";
import { runTick } from "@/lib/server/jobs";

export const dynamic = "force-dynamic";

/** For external schedulers (e.g. a platform cron hitting this every minute). Requires `Authorization: Bearer $CRON_SECRET`. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const report = await runTick();
  return Response.json({ ok: true, ...report });
}
