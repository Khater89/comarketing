# comarketing

Responsive web SaaS where a company's marketing team gets **AI-generated daily social media drafts**, reviews them **with per-platform previews in the same site**, approves them, and **schedules** them on a shared calendar. Every status change is logged.

Built from the PRD "comarketing — PRD" (brief: an automatic, scheduled daily social-media posting system for companies, with preview before publishing). Decisions the PRD left open are in [`docs/DECISIONS.md`](docs/DECISIONS.md), and acceptance results are in [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md).

## What's included

| Screen | Path | Highlights |
|---|---|---|
| Workspace dashboard | `/dashboard` | KPI cards (drafts, pending, scheduled, published this week), 7-day strip, approval queue, channel health, failed posts with retry metadata, status chart + table |
| Content composer | `/compose`, `/compose/:id` | AI draft (generate / regenerate), core message, per-platform tabs with character limits and media URLs, live previews, sticky action bar (save draft / request approval), scheduling once approved |
| Content calendar | `/calendar` | Month / week / list, filters (search, status, channel, author) with clear-filter and no-results states, drag-and-drop reschedule, detail drawer with timeline, bulk "move by N days", agenda list on phones |
| Approvals inbox | `/approvals` | Queue grouped by status, role-aware ("Needs your review" vs "Returned to you"), preview, approve / reject / request changes with comments, revision diff, comment thread, activity log |
| Settings | `/settings` | Company profile & brand voice, channel cards, posting defaults (cadence, times, platforms, auto-generation), users & roles, activity history |
| Notifications | `/notifications` | In-app notifications for approval requests, decisions, comments, failed publishes, generation failures |

**Post lifecycle:** `draft → pending_approval → approved → scheduled → published | failed`, plus `rejected`. Request changes returns the post to `draft`. Editing approved, scheduled or failed content returns it to `draft` for re-approval. The server enforces all transitions in `lib/domain.ts`.

**Roles:** `admin` (everything), `manager` (content, scheduling, settings), `creator` (drafts, submit), `approver` (approve/reject, schedule). Server actions check permissions and scope every query to the user's company.

## Stack

Next.js 16.4 (App Router, server actions) · React 19.3 · TypeScript · Tailwind CSS 4.3 · PostgreSQL · Prisma 6.19 · OpenAI Responses API (server-side) · Vitest. UI primitives are small shadcn-style components in `components/ui.tsx`. Authentication uses DB-backed sessions with bcrypt passwords (see DECISIONS for why this replaces Auth.js).

## Requirements

- Node.js ≥ 20.9 (tested on 22)
- PostgreSQL ≥ 14 (tested on 16)

## Setup

```bash
npm install
cp .env.example .env            # then edit DATABASE_URL etc.
npx prisma migrate deploy       # create tables
npm run db:seed                 # optional demo workspace (see below)
npm run build
npm start                       # web app on http://localhost:3000
npm run worker                  # in a second terminal: publishing + daily drafts, every 60 s
```

For development, use `npm run dev` instead of build/start. Run `npm run db:migrate` after changing the schema.

### Environment variables (`.env.example`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `OPENAI_API_KEY` | Server-only key for AI drafts. Without it, generation fails with a clear message |
| `OPENAI_MODEL` | Model for drafts (default `gpt-5-mini`; check it is available on your account) |
| `AI_MODE` | `openai` (default) or `mock` for development. Mock output is labelled "simulated" in the UI |
| `PUBLISHER_MODE` | `none` (default) or `simulate` for development. See "Publishing" |
| `CRON_SECRET` | Bearer token for `POST /api/cron/tick` |

Secrets are read only on the server and never sent to the browser.

### Demo data

`npm run db:seed` creates "Demo Coffee Roasters" (time zone Africa/Cairo) with four users. All use the password `demo-password-1`:
`admin@`, `manager@`, `creator@`, `approver@demo.comarketing.test`. This is demo data; do not run the seed in production.

## Deploy on Railway

The repo includes `railway.json`. The build runs `npm run build`. The start command, `npm run start:prod`, applies database migrations, optionally seeds the demo workspace, then starts Next.js on `$PORT`. The health check is `/login`.

1. In Railway: **New Project → Deploy from GitHub repo → `comarketing`**.
2. In the same project: **+ New → Database → PostgreSQL**.
3. On the app service, open **Variables** and add:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference to the Postgres service) |
   | `RUN_WORKER_IN_WEB` | `true` (runs publishing and daily drafts inside the web service, so no second service is needed) |
   | `CRON_SECRET` | a long random string |
   | `AI_MODE` / `OPENAI_API_KEY` / `OPENAI_MODEL` | `mock` for a demo, or `openai` with your key |
   | `PUBLISHER_MODE` | `simulate` for a demo, otherwise `none` |
   | `SEED_DEMO` | `true` on the first deploy to create the demo accounts, then remove it |

4. **Settings → Networking → Generate Domain** to get a public `https://…up.railway.app` URL.

Run a single replica while `RUN_WORKER_IN_WEB=true`. Extra replicas are safe, because jobs take database locks, but they add load for no benefit.

## Background jobs

`lib/server/jobs.ts → runTick()` does two jobs:

1. **Publish due posts.** Each post is claimed with an optimistic lock so parallel workers cannot double-publish. Each platform variant is published separately: variants that already succeeded are not re-sent on retry, and any failure marks the post `failed` with the reason, attempt count and time.
2. **Daily AI drafts.** For each company with auto-generation on, the job runs once per company-local day and creates `postingCadence` drafts for **tomorrow**, rotating through the campaign themes, with a *suggested* time taken from the preferred times. Drafts go to the approval inbox (or stay as drafts, depending on the setting). Nothing is scheduled without a human.

Ways to run it:
- `npm run worker` is a long-running loop (every 60 s).
- `npm run tick` runs once, for system cron: `* * * * * cd /app && npm run tick`.
- `RUN_WORKER_IN_WEB=true` runs the loop inside the web server (`instrumentation.ts`), which is handy on single-service hosts.
- `POST /api/cron/tick` with `Authorization: Bearer $CRON_SECRET`, for hosted schedulers.

## Publishing (important)

**No live social-network integration ships in this version.** Each platform needs app review, OAuth scopes and policy approval first (PRD §16). The app therefore never pretends to publish:

- With `PUBLISHER_MODE=none`, channels show *Not connected*. Scheduling still works, with warnings, but when a post comes due it is marked **failed** with the reason ("Instagram is not connected"). The failure is shown on the dashboard with retry metadata.
- With `PUBLISHER_MODE=simulate` (development only), admins can "Connect (simulated)" a channel. Due posts are then marked **Published (simulated)**, and a banner says nothing is sent to real networks.

To add a real provider, implement `PublisherAdapter` in `lib/server/publisher.ts`, register it in `LIVE_ADAPTERS`, and add an OAuth flow that stores a real `ChannelConnection` (token storage needs encryption at rest; it is not implemented yet).

## Tests

```bash
npm run typecheck
npm test          # unit tests; DB integration tests also run when DATABASE_URL is set
```

- `tests/domain.test.ts`: state machine, permissions, platform limits, time zone and DST conversion, revision diff.
- `tests/integration.test.ts`: the full journey against PostgreSQL, tenant isolation, edit conflicts, publish failure and retry, daily generation and its idempotency.

## Delivery: source ZIP vs build

- **Source ZIP** (`comarketing-source.zip`): this project without `node_modules`, `.next` or `.env`. Install, migrate and build as above.
- **Build:** `npm run build` produces `.next/`. Run it with `npm start` on a Node server, next to the same `.env` and database.

There is no `index.html` to open directly. The app needs a Node server, PostgreSQL and environment variables, and AI and publishing run server-side. Nothing works offline except the already-loaded UI. External services are PostgreSQL (required), the OpenAI API (for AI drafts) and, in future, the social-network APIs.

## Project layout

```
app/
  (auth)/login, signup        sign-in and workspace creation
  (app)/dashboard, compose, calendar, approvals, settings, notifications
  actions.ts                  server actions (validation + authorization)
  api/cron/tick/route.ts      scheduler endpoint
components/                   UI primitives, previews, sidebar, forms
lib/domain.ts                 pure rules: roles, state machine, platform limits
lib/tz.ts                     timezone conversion (Intl, DST-aware)
lib/server/                   db, auth, posts service, AI, publisher, jobs, audit
prisma/schema.prisma          data model; prisma/seed.ts demo data
scripts/worker.mts            background worker
tests/                        vitest unit + integration tests
docs/                         decisions and acceptance results
```
