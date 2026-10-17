// Fails fast with a readable message when required configuration is missing (e.g. on Railway).
const missing = ["DATABASE_URL"].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(
    `\n[comarketing] Missing required environment variable(s): ${missing.join(", ")}.\n` +
      "On Railway: open the app service → Variables → add DATABASE_URL as a reference to your Postgres service\n" +
      "(value ${{Postgres.DATABASE_URL}}, where 'Postgres' is the database service name), then redeploy.\n",
  );
  process.exit(1);
}
