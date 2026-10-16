// Background worker: publishes due posts and generates daily AI drafts.
// Usage: `npm run worker` (runs every 60 s) or `npm run tick` (single run, e.g. from system cron).
import { runTick } from "../lib/server/jobs.ts";
import { db } from "../lib/server/db.ts";

const once = process.argv.includes("--once");
const INTERVAL_MS = 60_000;

async function tick() {
  const started = new Date();
  try {
    const r = await runTick(started);
    console.log(`[${started.toISOString()}] published=${r.published} failed=${r.failed} generated=${r.generated} generationErrors=${r.generationErrors}`);
  } catch (e) {
    console.error(`[${started.toISOString()}] tick failed`, e);
  }
}

if (once) {
  await tick();
  await db.$disconnect();
} else {
  console.log("comarketing worker started; ticking every 60 s. Ctrl+C to stop.");
  await tick();
  const timer = setInterval(tick, INTERVAL_MS);
  const stop = async () => {
    clearInterval(timer);
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
