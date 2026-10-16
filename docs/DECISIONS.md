# Decisions, assumptions and open questions

The PRD's explicit requirements were followed. Where it was silent or left a decision open (§16), the choice below was made. Each one can be changed, and the file to change is listed.

## Decisions made in this implementation

| # | Topic | Decision | Where |
|---|---|---|---|
| D1 | Workspace model | One workspace = one company. A user belongs to exactly one company (PRD §18 proposal). Agencies with many clients are out of scope | `prisma/schema.prisma` |
| D2 | Roles | Manager plans and schedules but **cannot approve** (PRD §07: approvers or admins only). Creator cannot schedule. Approver can schedule after approving | `lib/domain.ts` `PERMISSIONS` |
| D3 | Self-approval | Allowed for admins and approvers (no separation-of-duties rule in the PRD). Open question Q6 | `lib/domain.ts` |
| D4 | Edits after approval | Any content change to an approved, scheduled or failed post returns it to `draft`, clears its schedule and approver, and requires re-approval. Saving without changes keeps the status | `lib/server/posts.ts` |
| D5 | "Request changes" | A separate decision that returns the post to `draft` and requires a comment. "Reject" keeps the post as `rejected` until the author edits it | `lib/domain.ts` |
| D6 | Edit conflicts | Optimistic locking on `Post.version`. A stale save is refused and the user's text is kept in the form | `lib/server/posts.ts` |
| D7 | Daily automation | Auto drafts are created once per company-local day for **tomorrow**, with a *suggested* time only. A human must approve and schedule them (PRD §18: human approval before every publish) | `lib/server/jobs.ts` |
| D8 | Publishing | No live provider adapters. Default mode fails honestly; `simulate` mode is for development only and is labelled in the UI | `lib/server/publisher.ts` |
| D9 | Channel connection | A missing connection **warns** at scheduling and **fails** at publish time, so planning is never blocked by integration status | `prePublishCheck` |
| D10 | Platform rules | Character limits X 280, Instagram 2,200, LinkedIn 3,000, Facebook 63,206; Instagram requires media. These are configuration values to verify against current provider docs before going live | `PLATFORM_RULES` |
| D11 | Auth | DB sessions (hashed random token, httpOnly cookie, 30 days) and bcrypt (cost 12), instead of Auth.js. Auth.js v5 is still in beta, and email/password login with roles needs only a few lines here. Swap it in if SSO/OAuth sign-in is needed | `lib/server/auth.ts` |
| D12 | Notifications | In-app only. No email or push is claimed | `lib/server/audit.ts` |
| D13 | Real-time inbox | Queues refresh every 15–20 s and when the tab is focused. Data is committed before the save response returns, so an approver's next load or refresh shows it (LLM-AC-4) | `components/auto-refresh.tsx` |
| D14 | Interface language | English, LTR (PRD §02). Text and layout are ready for later Arabic/RTL (`dir` on `<html>`, Arabic fallback font in the stack); no translations were produced | `app/layout.tsx` |
| D15 | "Scenario comparison" capability | Interpreted for this domain as **revision comparison** (word diff between the last two revisions in the approvals inbox). There is no numeric scenario model in the PRD | `lib/diff.ts` |
| D16 | Media | URL attachments only (PRD §18). No upload or storage | composer |
| D17 | Changing the company time zone | Already-scheduled posts keep their UTC instant. Their displayed local time changes | settings |

## Open questions for the product owner (from PRD §16, still open)

1. **Q1 Platforms and actions.** Which networks need *direct publishing* in phase 1 (and are app reviews started)? Today all four are supported for preview and scheduling only.
2. **Q2 Agencies.** Should one account manage several companies? That would need a membership table (user ↔ company with role) instead of `User.companyId`.
3. **Q3 Arabic UI.** The original brief is in Arabic. Is an Arabic/RTL interface (and Arabic-language AI drafts) required for launch?
4. **Q4 Brand inputs.** Are tone, audience, themes, prohibited words and hashtags enough, or are CTA style, emoji policy and competitor names also needed?
5. **Q5 Retry policy.** Retry is currently manual (reschedule a failed post). Should the system retry automatically, and how many times, with what back-off?
6. **Q6 Separation of duties.** May an approver approve their own post?
7. **Q7 Notifications.** Which events need email/Slack delivery, and to whom?
8. **Q8 Data retention.** How long should activity logs, AI generation records and old revisions be kept?

## Known limitations

- No password reset or email verification flow, and no login rate limiting. Add these before a public launch.
- Social account tokens are not stored, because there is no OAuth yet. When added, encrypt them at rest.
- Previews approximate each platform; they are not exact renderings.
- Calendar drag-and-drop is pointer-based. Keyboard users reschedule through the schedule form (in the drawer or review pane).
