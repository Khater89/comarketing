// Post lifecycle service. Every function scopes queries by the caller's companyId (tenant isolation)
// and re-checks the role on the server (PRD FR-07). Concurrent edits use optimistic locking on Post.version.

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { logActivity, notify } from "./audit";
import {
  PLATFORMS,
  PLATFORM_LABEL,
  STATUS_LABEL,
  transition,
  validateScheduleTime,
  validateVariant,
  type Platform,
  type PostCommand,
  type Role,
} from "@/lib/domain";
import { addDays, localDate, localTime, zonedToUtc } from "@/lib/tz";

export type Caller = { id: string; name: string; role: Role; companyId: string };

export type ServiceResult<T = { id: string }> =
  | ({ ok: true; message: string } & T)
  | { ok: false; error: string; fieldErrors?: Record<string, string>; conflict?: boolean };

const variantSchema = z.object({
  platform: z.enum(PLATFORMS),
  copy: z.string().max(70000),
  mediaUrl: z.string().trim().max(2000).optional().nullable(),
});

export const postInputSchema = z.object({
  id: z.string().optional(),
  version: z.number().int().optional(),
  title: z.string().trim().min(1, "Enter a title.").max(120, "Keep the title under 120 characters."),
  masterCopy: z.string().max(5000, "Keep the core message under 5,000 characters."),
  variants: z.array(variantSchema).min(1, "Choose at least one platform."),
  source: z.enum(["manual", "ai", "auto"]).optional(),
});

export type PostInput = z.infer<typeof postInputSchema>;

class ConflictError extends Error {}

function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    out[key] ??= issue.message;
  }
  return out;
}

function snapshotVariants(variants: { platform: Platform; copy: string; mediaUrl?: string | null }[]) {
  return variants
    .map((v) => ({ platform: v.platform, copy: v.copy, mediaUrl: v.mediaUrl || null }))
    .sort((a, b) => a.platform.localeCompare(b.platform));
}

export async function savePost(
  caller: Caller,
  raw: unknown,
  opts: { submit?: boolean } = {},
): Promise<ServiceResult<{ id: string; version: number }>> {
  const parsed = postInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Fix the highlighted fields.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const input = parsed.data;
  const seen = new Set<string>();
  const fieldErrors: Record<string, string> = {};
  for (const v of input.variants) {
    if (seen.has(v.platform)) fieldErrors[`variant.${v.platform}`] = "Duplicate platform.";
    seen.add(v.platform);
    const errs = validateVariant(v, "draft");
    if (errs.length) fieldErrors[`variant.${v.platform}`] = errs.join(" ");
  }
  if (Object.keys(fieldErrors).length) return { ok: false, error: "Fix the highlighted fields.", fieldErrors };

  const variants = snapshotVariants(input.variants);
  const actor = { id: caller.id, name: caller.name };

  try {
    const result = await db.$transaction(async (tx) => {
      let postId: string;
      let version: number;
      let status: string;

      if (!input.id) {
        const t = transition("draft", "edit", caller.role);
        if (!t.ok) throw new Error(t.error);
        const post = await tx.post.create({
          data: {
            companyId: caller.companyId,
            title: input.title,
            masterCopy: input.masterCopy,
            source: input.source ?? "manual",
            createdById: caller.id,
            variants: { create: variants },
            revisions: {
              create: { version: 1, title: input.title, masterCopy: input.masterCopy, variants, editorId: caller.id },
            },
          },
        });
        await logActivity(tx, {
          companyId: caller.companyId,
          actor,
          entityType: "post",
          entityId: post.id,
          action: "created draft",
          detail: input.title,
        });
        postId = post.id;
        version = post.version;
        status = post.status;
      } else {
        const existing = await tx.post.findFirst({
          where: { id: input.id, companyId: caller.companyId },
          include: { variants: true },
        });
        if (!existing) throw new Error("Post not found.");
        if (input.version !== existing.version) throw new ConflictError();

        const changed =
          existing.title !== input.title ||
          existing.masterCopy !== input.masterCopy ||
          JSON.stringify(snapshotVariants(existing.variants)) !== JSON.stringify(variants);

        postId = existing.id;
        version = existing.version;
        status = existing.status;

        if (changed) {
          const t = transition(existing.status, "edit", caller.role);
          if (!t.ok) throw new Error(t.error);
          const resetsApproval = ["approved", "scheduled", "failed"].includes(existing.status);
          const updated = await tx.post.updateMany({
            where: { id: existing.id, version: existing.version },
            data: {
              title: input.title,
              masterCopy: input.masterCopy,
              status: t.to,
              version: { increment: 1 },
              ...(resetsApproval ? { scheduledAt: null, approvedById: null, failureReason: null } : {}),
            },
          });
          if (updated.count !== 1) throw new ConflictError();
          version = existing.version + 1;
          status = t.to;

          await tx.postVariant.deleteMany({
            where: { postId: existing.id, platform: { notIn: variants.map((v) => v.platform) } },
          });
          for (const v of variants) {
            await tx.postVariant.upsert({
              where: { postId_platform: { postId: existing.id, platform: v.platform } },
              create: { postId: existing.id, ...v },
              update: { copy: v.copy, mediaUrl: v.mediaUrl, publishStatus: null, publishError: null },
            });
          }
          await tx.postRevision.create({
            data: { postId: existing.id, version, title: input.title, masterCopy: input.masterCopy, variants, editorId: caller.id },
          });
          await logActivity(tx, {
            companyId: caller.companyId,
            actor,
            entityType: "post",
            entityId: existing.id,
            action: resetsApproval || existing.status === "pending_approval" ? "edited (returned to draft for re-approval)" : "edited draft",
            detail: input.title,
          });
        }
      }

      if (opts.submit) {
        const t = transition(status as never, "submit", caller.role);
        if (!t.ok) throw new Error(t.error);
        const updated = await tx.post.updateMany({
          where: { id: postId, version },
          data: { status: t.to, version: { increment: 1 } },
        });
        if (updated.count !== 1) throw new ConflictError();
        version += 1;
        await tx.approvalAction.create({ data: { postId, actorUserId: caller.id, action: "submit" } });
        await logActivity(tx, { companyId: caller.companyId, actor, entityType: "post", entityId: postId, action: "submitted for approval" });
        await notify(tx, {
          companyId: caller.companyId,
          type: "approval_requested",
          message: `${caller.name} submitted “${input.title}” for approval.`,
          postId,
          roles: ["approver", "admin"],
          excludeUserId: caller.id,
        });
      }
      return { id: postId, version };
    });
    return { ok: true, ...result, message: opts.submit ? "Saved and submitted for approval." : "Draft saved." };
  } catch (e) {
    if (e instanceof ConflictError) {
      return {
        ok: false,
        conflict: true,
        error: "Someone else changed this post since you opened it. Your edits are kept below — copy them, then reload to see the latest version.",
      };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the post." };
  }
}

const decisionMessages: Partial<Record<PostCommand, string>> = {
  approve: "approved",
  reject: "rejected",
  request_changes: "returned for changes",
  submit: "submitted for approval",
  unschedule: "unscheduled",
};

export async function decide(
  caller: Caller,
  input: { postId: string; version: number; command: "approve" | "reject" | "request_changes" | "submit" | "unschedule"; comment?: string },
): Promise<ServiceResult> {
  const comment = input.comment?.trim().slice(0, 2000) || undefined;
  if (input.command === "request_changes" && !comment) {
    return { ok: false, error: "Explain what needs to change.", fieldErrors: { comment: "A comment is required when requesting changes." } };
  }
  try {
    return await db.$transaction(async (tx) => {
      const post = await tx.post.findFirst({ where: { id: input.postId, companyId: caller.companyId } });
      if (!post) return { ok: false, error: "Post not found." } as const;
      if (post.version !== input.version) throw new ConflictError();
      const t = transition(post.status, input.command, caller.role);
      if (!t.ok) return { ok: false, error: t.error } as const;

      const data: Prisma.PostUncheckedUpdateManyInput = { status: t.to, version: { increment: 1 } };
      if (input.command === "approve") data.approvedById = caller.id;
      if (input.command === "unschedule") data.scheduledAt = null;
      const updated = await tx.post.updateMany({ where: { id: post.id, version: post.version }, data });
      if (updated.count !== 1) throw new ConflictError();

      await tx.approvalAction.create({
        data: { postId: post.id, actorUserId: caller.id, action: input.command, comment },
      });
      const verb = decisionMessages[input.command]!;
      await logActivity(tx, {
        companyId: caller.companyId,
        actor: caller,
        entityType: "post",
        entityId: post.id,
        action: verb,
        detail: comment,
      });
      if (input.command === "approve" || input.command === "reject" || input.command === "request_changes") {
        await notify(tx, {
          companyId: caller.companyId,
          type: `post_${input.command}`,
          message: `${caller.name} ${verb} “${post.title}”${comment ? `: ${comment}` : "."}`,
          postId: post.id,
          userIds: [post.createdById],
          roles: input.command === "approve" ? ["manager"] : [],
          excludeUserId: caller.id,
        });
      }
      return { ok: true, id: post.id, message: `Post ${verb}. Status: ${STATUS_LABEL[t.to]}.` } as const;
    });
  } catch (e) {
    if (e instanceof ConflictError) return { ok: false, conflict: true, error: "This post changed since you loaded it. Reload and try again." };
    throw e;
  }
}

export async function addComment(caller: Caller, postId: string, comment: string): Promise<ServiceResult> {
  const text = comment.trim();
  if (!text) return { ok: false, error: "Write a comment first.", fieldErrors: { comment: "Comment cannot be empty." } };
  const post = await db.post.findFirst({ where: { id: postId, companyId: caller.companyId }, select: { id: true, title: true, createdById: true } });
  if (!post) return { ok: false, error: "Post not found." };
  await db.$transaction(async (tx) => {
    await tx.approvalAction.create({ data: { postId, actorUserId: caller.id, action: "comment", comment: text.slice(0, 2000) } });
    await logActivity(tx, { companyId: caller.companyId, actor: caller, entityType: "post", entityId: postId, action: "commented" });
    await notify(tx, {
      companyId: caller.companyId,
      type: "comment",
      message: `${caller.name} commented on “${post.title}”.`,
      postId,
      userIds: [post.createdById],
      excludeUserId: caller.id,
    });
  });
  return { ok: true, id: postId, message: "Comment added." };
}

/** Pre-publish checks shared by scheduling and the publishing job. Returns blocking errors and warnings. */
export async function prePublishCheck(companyId: string, postId: string) {
  const post = await db.post.findFirst({ where: { id: postId, companyId }, include: { variants: true } });
  if (!post) return { errors: ["Post not found."], warnings: [] };
  const errors = post.variants.flatMap((v) => validateVariant(v, "publish"));
  if (!post.variants.length) errors.push("The post has no platform variants.");
  const channels = await db.channelConnection.findMany({ where: { companyId } });
  const warnings = post.variants
    .filter((v) => channels.find((c) => c.platform === v.platform)?.connectionStatus !== "connected")
    .map((v) => `${PLATFORM_LABEL[v.platform]} is not connected; publishing to it will fail until it is.`);
  return { errors, warnings };
}

export async function schedule(
  caller: Caller,
  input: { postId: string; version: number; date: string; time: string; timeZone: string; now?: Date },
): Promise<ServiceResult<{ id: string; warnings: string[] }>> {
  const when = zonedToUtc(input.date, input.time, input.timeZone);
  if (!when.ok) return { ok: false, error: when.error, fieldErrors: { when: when.error } };
  const timeError = validateScheduleTime(when.value, input.now ?? new Date());
  if (timeError) return { ok: false, error: timeError, fieldErrors: { when: timeError } };

  const post = await db.post.findFirst({ where: { id: input.postId, companyId: caller.companyId } });
  if (!post) return { ok: false, error: "Post not found." };
  const t = transition(post.status, "schedule", caller.role);
  if (!t.ok) return { ok: false, error: t.error };

  const check = await prePublishCheck(caller.companyId, post.id);
  if (check.errors.length) return { ok: false, error: `Fix before scheduling: ${check.errors.join(" ")}` };

  const updated = await db.$transaction(async (tx) => {
    const r = await tx.post.updateMany({
      where: { id: post.id, version: input.version, status: post.status },
      data: {
        status: "scheduled",
        scheduledAt: when.value,
        version: { increment: 1 },
        publishLockedAt: null,
        failureReason: post.status === "failed" ? post.failureReason : null,
      },
    });
    if (r.count !== 1) return false;
    await tx.approvalAction.create({ data: { postId: post.id, actorUserId: caller.id, action: "schedule", comment: `${input.date} ${input.time} ${input.timeZone}` } });
    await logActivity(tx, {
      companyId: caller.companyId,
      actor: caller,
      entityType: "post",
      entityId: post.id,
      action: post.status === "failed" ? "rescheduled after failure" : post.status === "scheduled" ? "rescheduled" : "scheduled",
      detail: `${input.date} ${input.time} (${input.timeZone})`,
    });
    return true;
  });
  if (!updated) return { ok: false, conflict: true, error: "This post changed since you loaded it. Reload and try again." };
  return {
    ok: true,
    id: post.id,
    warnings: check.warnings,
    message: `Scheduled for ${input.date} ${input.time} (${input.timeZone}).`,
  };
}

/** Move scheduled posts by whole days, keeping their local time of day. */
export async function shiftScheduled(
  caller: Caller,
  input: { postIds: string[]; days: number; timeZone: string; now?: Date },
): Promise<{ ok: true; message: string; failures: string[] } | { ok: false; error: string }> {
  if (!Number.isInteger(input.days) || input.days === 0 || Math.abs(input.days) > 365) {
    return { ok: false, error: "Enter a whole number of days between -365 and 365 (not 0)." };
  }
  if (!input.postIds.length) return { ok: false, error: "Select at least one scheduled post." };
  const posts = await db.post.findMany({ where: { id: { in: input.postIds.slice(0, 200) }, companyId: caller.companyId } });
  const failures: string[] = [];
  let moved = 0;
  for (const p of posts) {
    if (p.status !== "scheduled" || !p.scheduledAt) {
      failures.push(`“${p.title}” is not scheduled.`);
      continue;
    }
    const r = await schedule(caller, {
      postId: p.id,
      version: p.version,
      date: addDays(localDate(p.scheduledAt, input.timeZone), input.days),
      time: localTime(p.scheduledAt, input.timeZone),
      timeZone: input.timeZone,
      now: input.now,
    });
    if (r.ok) moved++;
    else failures.push(`“${p.title}”: ${r.error}`);
  }
  return { ok: true, message: `Moved ${moved} of ${posts.length} post(s).`, failures };
}
