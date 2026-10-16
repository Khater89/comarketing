// Pure domain rules (no I/O) so they can be unit-tested and reused by server actions and jobs.
// Rule sources: PRD sections 06 (LLM-FR-6) and 07 (domain rules). Decisions not stated in the PRD
// are marked "DECISION" and listed in docs/DECISIONS.md.

export const ROLES = ["admin", "manager", "creator", "approver"] as const;
export type Role = (typeof ROLES)[number];

export const POST_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "scheduled",
  "published",
  "failed",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const PLATFORMS = ["instagram", "x", "facebook", "linkedin"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  manager: "Marketing manager",
  creator: "Content creator",
  approver: "Approver",
};

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  x: "X",
  facebook: "Facebook",
  linkedin: "LinkedIn",
};

// ---------------------------------------------------------------- permissions

export type Permission =
  | "post.edit" // create, edit, AI-generate, submit for approval
  | "post.approve" // approve, reject, request changes (PRD 07: approvers or admins only)
  | "post.schedule" // schedule, unschedule, reschedule, retry
  | "post.comment"
  | "company.settings" // brand profile, posting defaults, channels
  | "users.manage";

const PERMISSIONS: Record<Role, Permission[]> = {
  admin: ["post.edit", "post.approve", "post.schedule", "post.comment", "company.settings", "users.manage"],
  // DECISION: managers plan and schedule but cannot approve (PRD 07 restricts approval to approvers/admins).
  manager: ["post.edit", "post.schedule", "post.comment", "company.settings"],
  // DECISION: creators draft and submit; they cannot schedule.
  creator: ["post.edit", "post.comment"],
  approver: ["post.approve", "post.schedule", "post.comment"],
};

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role].includes(permission);
}

// ---------------------------------------------------------------- state machine

export type PostCommand =
  | "submit"
  | "approve"
  | "reject"
  | "request_changes"
  | "schedule"
  | "unschedule"
  | "edit"
  | "publish_success"
  | "publish_failure";

type Transition = { from: PostStatus[]; to: PostStatus; permission: Permission | "system" };

const TRANSITIONS: Record<PostCommand, Transition> = {
  submit: { from: ["draft", "rejected"], to: "pending_approval", permission: "post.edit" },
  approve: { from: ["pending_approval"], to: "approved", permission: "post.approve" },
  reject: { from: ["pending_approval"], to: "rejected", permission: "post.approve" },
  // PRD 07: rejected posts return to draft / changes-requested with preserved comments.
  request_changes: { from: ["pending_approval"], to: "draft", permission: "post.approve" },
  // PRD 07: a post cannot be scheduled until it is approved. Failed posts were approved and may be retried.
  schedule: { from: ["approved", "scheduled", "failed"], to: "scheduled", permission: "post.schedule" },
  unschedule: { from: ["scheduled"], to: "approved", permission: "post.schedule" },
  // DECISION: any content edit invalidates approval, so the post returns to draft and must be re-approved.
  edit: {
    from: ["draft", "rejected", "pending_approval", "approved", "scheduled", "failed"],
    to: "draft",
    permission: "post.edit",
  },
  publish_success: { from: ["scheduled"], to: "published", permission: "system" },
  publish_failure: { from: ["scheduled"], to: "failed", permission: "system" },
};

export type TransitionResult = { ok: true; to: PostStatus } | { ok: false; error: string };

export function transition(
  current: PostStatus,
  command: PostCommand,
  actor: Role | "system",
): TransitionResult {
  const t = TRANSITIONS[command];
  if (t.permission === "system") {
    if (actor !== "system") return { ok: false, error: "Only the publishing job can perform this action." };
  } else if (actor === "system" || !can(actor, t.permission)) {
    return { ok: false, error: `Your role cannot ${commandVerb(command)} posts.` };
  }
  if (!t.from.includes(current)) {
    return {
      ok: false,
      error: `A ${STATUS_LABEL[current].toLowerCase()} post cannot be ${commandPast(command)}.`,
    };
  }
  return { ok: true, to: t.to };
}

export function allowedCommands(current: PostStatus, role: Role): PostCommand[] {
  return (Object.keys(TRANSITIONS) as PostCommand[]).filter((c) => transition(current, c, role).ok);
}

function commandVerb(c: PostCommand): string {
  return {
    submit: "submit",
    approve: "approve",
    reject: "reject",
    request_changes: "request changes on",
    schedule: "schedule",
    unschedule: "unschedule",
    edit: "edit",
    publish_success: "publish",
    publish_failure: "fail",
  }[c];
}

function commandPast(c: PostCommand): string {
  return {
    submit: "submitted for approval",
    approve: "approved",
    reject: "rejected",
    request_changes: "returned for changes",
    schedule: "scheduled",
    unschedule: "unscheduled",
    edit: "edited",
    publish_success: "published",
    publish_failure: "marked failed",
  }[c];
}

// ---------------------------------------------------------------- platform rules

// Text limits are configuration, not provider-verified contracts: confirm against each provider's
// current API documentation before enabling live publishing (PRD 07, PRD 16).
export const PLATFORM_RULES: Record<Platform, { maxChars: number; requiresMedia: boolean }> = {
  instagram: { maxChars: 2200, requiresMedia: true },
  x: { maxChars: 280, requiresMedia: false },
  facebook: { maxChars: 63206, requiresMedia: false },
  linkedin: { maxChars: 3000, requiresMedia: false },
};

export type VariantInput = { platform: Platform; copy: string; mediaUrl?: string | null };

export function validateVariant(v: VariantInput, mode: "draft" | "publish"): string[] {
  const rules = PLATFORM_RULES[v.platform];
  const errors: string[] = [];
  const length = [...v.copy].length;
  if (length > rules.maxChars) {
    errors.push(`${PLATFORM_LABEL[v.platform]} copy is ${length} characters; the limit is ${rules.maxChars}.`);
  }
  if (v.mediaUrl && !isHttpUrl(v.mediaUrl)) {
    errors.push(`${PLATFORM_LABEL[v.platform]} media must be an http(s) URL.`);
  }
  if (mode === "publish") {
    if (length === 0) errors.push(`${PLATFORM_LABEL[v.platform]} copy is empty.`);
    if (rules.requiresMedia && !v.mediaUrl) {
      errors.push(`${PLATFORM_LABEL[v.platform]} posts require an image or video URL.`);
    }
  }
  return errors;
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function findProhibitedWords(text: string, prohibitedList: string): string[] {
  const words = prohibitedList
    .split(/[,\n]/)
    .map((w) => w.trim())
    .filter(Boolean);
  const lower = text.toLowerCase();
  return words.filter((w) => lower.includes(w.toLowerCase()));
}

// ---------------------------------------------------------------- scheduling

export function validateScheduleTime(scheduledAt: Date, now: Date): string | null {
  if (Number.isNaN(scheduledAt.getTime())) return "Enter a valid date and time.";
  // PRD 07: scheduled publish time must be in the future at time of scheduling.
  if (scheduledAt.getTime() <= now.getTime()) return "Choose a time in the future.";
  return null;
}

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
