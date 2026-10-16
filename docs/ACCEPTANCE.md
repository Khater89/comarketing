# Acceptance results

Verified on 2026-10-16 against PostgreSQL 16 and Node 22, with `AI_MODE=mock` and `PUBLISHER_MODE=simulate` / unconnected channels. "Integration" means `tests/integration.test.ts`. "Browser" means a scripted Chromium run of the real app (creator → approver → manager → approver, plus 360px mobile pages).

| Criterion | How verified | Result |
|---|---|---|
| AC-01 journey produces the outcome | Browser: creator generates, saves and submits → approver approves → schedule blocked (Instagram without media) → manager adds media and resubmits → approver approves → scheduled; appears in calendar and list | Pass |
| AC-02 missing/out-of-range input blocked with specific messages, other entries kept | Integration (empty title, 281-char X copy → field errors); forms return values on error | Pass |
| AC-03 service failure is not shown as success | Integration: publish with no connection → `failed` + reason, no `publishedAt`; AI without key returns an explicit error (code path) | Pass |
| AC-04 keyboard and 360px | Browser: `scrollWidth` = 360 on dashboard, calendar, settings and composer; labelled fields, visible focus ring, skip link, arrow-key platform tabs | Pass (drag-and-drop has a form alternative) |
| LLM-AC-1 tenant isolation | Integration: another company's admin gets "Post not found" | Pass |
| LLM-AC-2 admin creates users with roles | Settings → Users (admin-only server action); four roles | Pass (manual UI) |
| LLM-AC-3 AI draft, edit, save without publishing | Browser | Pass |
| LLM-AC-4 submitted draft in approver inbox | Integration: notification created; browser: approver sees it on first load | Pass |
| LLM-AC-5 approve/reject with comment, logged | Integration: ApprovalAction with comment + ActivityLog "approved" | Pass |
| LLM-AC-6 scheduling blocked unless approved | Unit + integration (draft, pending, rejected, published, and the creator role) | Pass |
| LLM-AC-7 timezone-aware scheduling | Integration: 2099-01-01 09:00 Africa/Cairo → 07:00Z; DST gap rejected (unit) | Pass |
| LLM-AC-8 calendar filtered by status and platform | Browser: list `status=scheduled` → 1 item; search with no match → no-results state | Pass |
| LLM-AC-9 dashboard counts match records | Integration: groupBy total = row count; dashboard reads the same query | Pass |
| LLM-AC-10 failed publish visible with retry metadata | Integration (attempts, reason, time) and dashboard "failed posts" panel; retry via reschedule → published (simulated) | Pass |

Not verified here: live OpenAI calls (no API key in the test environment) and real social-network publishing (not implemented, see DECISIONS D8).
