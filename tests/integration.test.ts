// Integration tests against a real PostgreSQL database (DATABASE_URL). Skipped when it is not set.
// Each run creates isolated companies with random names and removes them afterwards.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;

d("post lifecycle against the database", async () => {
  const { db } = await import("@/lib/server/db");
  const { savePost, decide, schedule } = await import("@/lib/server/posts");
  const { runTick } = await import("@/lib/server/jobs");
  const { statusCountsForTest } = { statusCountsForTest: async (companyId: string) => db.post.groupBy({ by: ["status"], where: { companyId }, _count: { _all: true } }) };

  const tag = randomUUID().slice(0, 8);
  let companyA: string, companyB: string;
  const users: Record<string, { id: string; name: string; role: "admin" | "manager" | "creator" | "approver"; companyId: string; company: { timezone: string } }> = {};

  beforeAll(async () => {
    const a = await db.company.create({ data: { name: `Test A ${tag}`, timezone: "Africa/Cairo", channels: { create: [{ platform: "x" }, { platform: "linkedin" }] } } });
    const b = await db.company.create({ data: { name: `Test B ${tag}`, timezone: "UTC" } });
    companyA = a.id;
    companyB = b.id;
    for (const role of ["admin", "manager", "creator", "approver"] as const) {
      const u = await db.user.create({ data: { companyId: a.id, name: `${role} ${tag}`, email: `${role}-${tag}@test.local`, role, passwordHash: "x" } });
      users[role] = { id: u.id, name: u.name, role, companyId: a.id, company: { timezone: a.timezone } };
    }
    const other = await db.user.create({ data: { companyId: b.id, name: `outsider ${tag}`, email: `outsider-${tag}@test.local`, role: "admin", passwordHash: "x" } });
    users.outsider = { id: other.id, name: other.name, role: "admin", companyId: b.id, company: { timezone: "UTC" } };
  });

  afterAll(async () => {
    await db.post.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
    await db.company.deleteMany({ where: { id: { in: [companyA, companyB] } } });
    await db.$disconnect();
  });

  const draft = { title: "Launch", masterCopy: "Hello", variants: [{ platform: "x" as const, copy: "Hello X" }, { platform: "linkedin" as const, copy: "Hello LinkedIn" }] };

  it("AC-02: blocks invalid input with field errors", async () => {
    const r = await savePost(users.creator, { ...draft, title: "", variants: [{ platform: "x", copy: "a".repeat(281) }] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors?.title).toBeDefined();
    }
    const r2 = await savePost(users.creator, { ...draft, variants: [{ platform: "x", copy: "a".repeat(281) }] });
    expect(!r2.ok && r2.fieldErrors?.["variant.x"]).toMatch(/281/);
  });

  it("full journey: draft → submit → approve → schedule → publish failure → retry → simulated publish", async () => {
    const created = await savePost(users.creator, draft);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // LLM-AC-1: other tenants cannot see or act on it
    const peek = await decide(users.outsider, { postId: created.id, version: created.version, command: "submit" });
    expect(peek).toMatchObject({ ok: false, error: "Post not found." });

    // LLM-AC-6: cannot schedule a draft
    const tooEarly = await schedule(users.admin, { postId: created.id, version: created.version, date: "2099-01-01", time: "09:00", timeZone: "Africa/Cairo" });
    expect(tooEarly.ok).toBe(false);

    const submitted = await savePost(users.creator, { ...draft, id: created.id, version: created.version }, { submit: true });
    expect(submitted.ok).toBe(true);
    let post = await db.post.findUniqueOrThrow({ where: { id: created.id } });
    expect(post.status).toBe("pending_approval");
    // LLM-AC-4: approver is notified
    expect(await db.notification.count({ where: { userId: users.approver.id, postId: post.id, type: "approval_requested" } })).toBe(1);

    // only approvers/admins approve
    expect((await decide(users.manager, { postId: post.id, version: post.version, command: "approve" })).ok).toBe(false);
    // request changes requires a comment
    expect((await decide(users.approver, { postId: post.id, version: post.version, command: "request_changes" })).ok).toBe(false);
    // stale version conflict
    expect(await decide(users.approver, { postId: post.id, version: post.version - 1, command: "approve" })).toMatchObject({ ok: false, conflict: true });

    const approved = await decide(users.approver, { postId: post.id, version: post.version, command: "approve", comment: "Looks good" });
    expect(approved.ok).toBe(true);
    post = await db.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(post.status).toBe("approved");
    expect(post.approvedById).toBe(users.approver.id);
    // LLM-AC-5: decision logged
    expect(await db.activityLog.count({ where: { entityId: post.id, action: "approved" } })).toBe(1);
    expect(await db.approvalAction.count({ where: { postId: post.id, action: "approve", comment: "Looks good" } })).toBe(1);

    // creators cannot schedule; past time rejected; LLM-AC-7 timezone-aware schedule
    expect((await schedule(users.creator, { postId: post.id, version: post.version, date: "2099-01-01", time: "09:00", timeZone: "Africa/Cairo" })).ok).toBe(false);
    expect((await schedule(users.manager, { postId: post.id, version: post.version, date: "2020-01-01", time: "09:00", timeZone: "Africa/Cairo" })).ok).toBe(false);
    const sched = await schedule(users.manager, { postId: post.id, version: post.version, date: "2099-01-01", time: "09:00", timeZone: "Africa/Cairo" });
    expect(sched.ok).toBe(true);
    if (sched.ok) expect(sched.warnings.length).toBe(2); // neither channel connected
    post = await db.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(post.scheduledAt?.toISOString()).toBe("2099-01-01T07:00:00.000Z");

    // LLM-AC-10: publishing with no connected channel fails honestly
    const tick1 = await runTick(new Date("2099-01-01T07:01:00Z"));
    expect(tick1.failed).toBeGreaterThanOrEqual(1);
    post = await db.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(post.status).toBe("failed");
    expect(post.failureReason).toMatch(/not connected/);
    expect(post.publishAttempts).toBe(1);
    expect(post.publishedAt).toBeNull();

    // simulated connection + simulate mode → published (simulated)
    process.env.PUBLISHER_MODE = "simulate";
    await db.channelConnection.updateMany({ where: { companyId: companyA }, data: { connectionStatus: "connected", simulated: true } });
    const retry = await schedule(users.approver, { postId: post.id, version: post.version, date: "2099-01-02", time: "10:00", timeZone: "Africa/Cairo", now: new Date("2099-01-01T08:00:00Z") });
    expect(retry.ok).toBe(true);
    await runTick(new Date("2099-01-02T08:30:00Z"));
    post = await db.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(post.status).toBe("published");
    expect(post.publishedVia).toBe("simulated");
    expect(post.publishAttempts).toBe(2);

    // published posts are immutable
    expect((await savePost(users.admin, { ...draft, title: "Changed", id: post.id, version: post.version })).ok).toBe(false);
  });

  it("editing an approved post resets it to draft", async () => {
    const c = await savePost(users.creator, draft, { submit: true });
    if (!c.ok) throw new Error(c.error);
    await decide(users.admin, { postId: c.id, version: c.version, command: "approve" });
    const p = await db.post.findUniqueOrThrow({ where: { id: c.id } });
    const edited = await savePost(users.creator, { ...draft, masterCopy: "Changed", id: p.id, version: p.version });
    expect(edited.ok).toBe(true);
    const after = await db.post.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.status).toBe("draft");
    expect(after.approvedById).toBeNull();
    expect(await db.postRevision.count({ where: { postId: c.id } })).toBe(2);
  });

  it("LLM-AC-9: counts match records", async () => {
    const rows = await statusCountsForTest(companyA);
    const total = rows.reduce((s, r) => s + r._count._all, 0);
    expect(total).toBe(await db.post.count({ where: { companyId: companyA } }));
  });

  it("daily generation creates pending drafts with suggested times (mock AI)", async () => {
    process.env.AI_MODE = "mock";
    await db.company.update({ where: { id: companyA }, data: { autoGenerateEnabled: true, postingCadence: 2, preferredPublishTimes: ["09:00", "18:00"], defaultPlatforms: ["x", "linkedin"], campaignGoals: "Theme one\nTheme two" } });
    const r = await runTick(new Date("2026-10-16T10:00:00Z"));
    expect(r.generated).toBeGreaterThanOrEqual(2);
    const auto = await db.post.findMany({ where: { companyId: companyA, source: "auto" }, orderBy: { suggestedAt: "asc" } });
    expect(auto).toHaveLength(2);
    expect(auto.every((p) => p.status === "pending_approval" && p.scheduledAt === null)).toBe(true);
    expect(auto[0].suggestedAt?.toISOString()).toBe("2026-10-17T06:00:00.000Z");
    // second tick same day: no duplicates
    await runTick(new Date("2026-10-16T11:00:00Z"));
    expect(await db.post.count({ where: { companyId: companyA, source: "auto" } })).toBe(2);
  });
});
