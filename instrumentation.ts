// Runs once when the Next.js server starts. With RUN_WORKER_IN_WEB=true the web process also runs the
// background jobs (publishing + daily AI drafts) every 60 s, so a single service (e.g. on Railway) is enough.
// Jobs claim work with database locks, so running a separate `npm run worker` as well is safe.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.RUN_WORKER_IN_WEB !== "true") return;
  const { runTick } = await import("./lib/server/jobs");
  const tick = async () => {
    const started = new Date();
    try {
      const r = await runTick(started);
      if (r.published || r.failed || r.generated || r.generationErrors) {
        console.log(`[worker ${started.toISOString()}] published=${r.published} failed=${r.failed} generated=${r.generated} generationErrors=${r.generationErrors}`);
      }
    } catch (e) {
      console.error(`[worker ${started.toISOString()}] tick failed`, e);
    }
  };
  console.log("In-process worker enabled (RUN_WORKER_IN_WEB=true); ticking every 60 s.");
  setTimeout(tick, 5_000);
  setInterval(tick, 60_000);
}
