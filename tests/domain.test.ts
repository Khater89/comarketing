import { describe, expect, it } from "vitest";
import {
  allowedCommands,
  can,
  findProhibitedWords,
  transition,
  validateScheduleTime,
  validateVariant,
} from "@/lib/domain";
import { addDays, localDate, localTime, weekdayIndex, zonedToUtc } from "@/lib/tz";
import { diffWords } from "@/lib/diff";

describe("approval state machine", () => {
  it("lets a creator submit a draft but not approve it", () => {
    expect(transition("draft", "submit", "creator")).toEqual({ ok: true, to: "pending_approval" });
    expect(transition("pending_approval", "approve", "creator").ok).toBe(false);
  });

  it("only approvers and admins can approve (PRD 07)", () => {
    expect(transition("pending_approval", "approve", "approver")).toEqual({ ok: true, to: "approved" });
    expect(transition("pending_approval", "approve", "admin")).toEqual({ ok: true, to: "approved" });
    expect(transition("pending_approval", "approve", "manager").ok).toBe(false);
  });

  it("blocks scheduling posts that are not approved (LLM-AC-6)", () => {
    for (const s of ["draft", "pending_approval", "rejected", "published"] as const) {
      expect(transition(s, "schedule", "admin").ok).toBe(false);
    }
    expect(transition("approved", "schedule", "manager")).toEqual({ ok: true, to: "scheduled" });
    expect(transition("failed", "schedule", "approver")).toEqual({ ok: true, to: "scheduled" });
    expect(transition("approved", "schedule", "creator").ok).toBe(false);
  });

  it("returns rejected and changes-requested posts to draft", () => {
    expect(transition("pending_approval", "request_changes", "approver")).toEqual({ ok: true, to: "draft" });
    expect(transition("rejected", "edit", "creator")).toEqual({ ok: true, to: "draft" });
    expect(transition("rejected", "submit", "creator")).toEqual({ ok: true, to: "pending_approval" });
  });

  it("invalidates approval when content is edited and forbids editing published posts", () => {
    expect(transition("scheduled", "edit", "manager")).toEqual({ ok: true, to: "draft" });
    expect(transition("published", "edit", "admin").ok).toBe(false);
  });

  it("reserves publish outcomes for the system job", () => {
    expect(transition("scheduled", "publish_success", "admin").ok).toBe(false);
    expect(transition("scheduled", "publish_failure", "system")).toEqual({ ok: true, to: "failed" });
  });

  it("lists allowed commands per role", () => {
    expect(allowedCommands("pending_approval", "approver").sort()).toEqual(["approve", "reject", "request_changes"]);
    expect(can("creator", "users.manage")).toBe(false);
  });
});

describe("platform validation", () => {
  it("enforces the X character limit", () => {
    expect(validateVariant({ platform: "x", copy: "a".repeat(280) }, "publish")).toEqual([]);
    expect(validateVariant({ platform: "x", copy: "a".repeat(281) }, "draft")[0]).toMatch(/281 characters/);
  });

  it("requires media for Instagram only when publishing", () => {
    expect(validateVariant({ platform: "instagram", copy: "hi" }, "draft")).toEqual([]);
    expect(validateVariant({ platform: "instagram", copy: "hi" }, "publish")[0]).toMatch(/require an image/);
    expect(validateVariant({ platform: "instagram", copy: "hi", mediaUrl: "javascript:alert(1)" }, "draft")[0]).toMatch(
      /http/,
    );
  });

  it("detects prohibited words case-insensitively", () => {
    expect(findProhibitedWords("Best CHEAP deal", "cheap, guaranteed")).toEqual(["cheap"]);
  });
});

describe("scheduling time", () => {
  const now = new Date("2026-10-16T10:00:00Z");
  it("rejects past and current times", () => {
    expect(validateScheduleTime(new Date("2026-10-16T10:00:00Z"), now)).toMatch(/future/);
    expect(validateScheduleTime(new Date("2026-10-16T10:01:00Z"), now)).toBeNull();
  });
});

describe("timezone conversion", () => {
  it("converts company-local wall time to UTC", () => {
    const r = zonedToUtc("2026-10-20", "09:00", "Africa/Cairo");
    expect(r.ok && r.value.toISOString()).toBe("2026-10-20T06:00:00.000Z");
    const ny = zonedToUtc("2026-07-01", "09:30", "America/New_York");
    expect(ny.ok && ny.value.toISOString()).toBe("2026-07-01T13:30:00.000Z");
  });

  it("rejects times skipped by daylight saving", () => {
    const r = zonedToUtc("2026-03-08", "02:30", "America/New_York");
    expect(r.ok).toBe(false);
  });

  it("round-trips local date and time", () => {
    const d = new Date("2026-12-31T23:30:00Z");
    expect(localDate(d, "Asia/Dubai")).toBe("2027-01-01");
    expect(localTime(d, "Asia/Dubai")).toBe("03:30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekdayIndex("2026-10-19")).toBe(0); // Monday
  });
});

describe("revision diff", () => {
  it("marks added and removed words", () => {
    const parts = diffWords("Launch our new app", "Launch our brand new app today");
    expect(parts.filter((p) => p.kind === "added").map((p) => p.text.trim())).toEqual(["brand", "today"]);
    expect(parts.some((p) => p.kind === "removed")).toBe(false);
  });
});
