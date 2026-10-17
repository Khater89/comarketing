// Fails fast with a readable message when required configuration is missing (e.g. on Railway).
// Prints only variable NAMES and whether they are set — never their values.
const env = process.env;
const url = env.DATABASE_URL;
if (url && url.trim()) process.exit(0);

const state = url === undefined ? "NOT SET" : "SET BUT EMPTY";
const expected = ["RUN_WORKER_IN_WEB", "AI_MODE", "PUBLISHER_MODE", "SEED_DEMO", "CRON_SECRET"];
const present = expected.filter((k) => env[k] !== undefined);
const related = Object.keys(env).filter((k) => /^(PG|POSTGRES|DATABASE)/i.test(k) && k !== "DATABASE_URL");

console.error(`
[comarketing] DATABASE_URL is ${state}.
  Railway service: ${env.RAILWAY_SERVICE_NAME ?? "(unknown)"} · environment: ${env.RAILWAY_ENVIRONMENT_NAME ?? "(unknown)"}
  Other app variables found on this service: ${present.length ? present.join(", ") : "none"}
  Database-related variable names found: ${related.length ? related.join(", ") : "none"}
${
  state === "SET BUT EMPTY"
    ? "  → The value is a reference that resolved to nothing. Use Variables → New Variable → Add Reference → pick the Postgres service → DATABASE_URL\n    (a typed ${{Postgres.DATABASE_URL}} only works if the database service is named exactly 'Postgres')."
    : present.length === 0
      ? "  → None of the app variables are on this service: they were probably added to the Postgres service, another environment,\n    or are still unsaved. Add them on THIS service and press Deploy in the banner that applies staged changes."
      : "  → Add DATABASE_URL on this service: Variables → New Variable → Add Reference → Postgres → DATABASE_URL, then Deploy."
}
`);
process.exit(1);
