"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/server/db";
import {
  AuthzError,
  createSession,
  destroySession,
  hashPassword,
  requirePermission,
  verifyPassword,
} from "@/lib/server/auth";
import { addComment, decide, savePost, schedule, shiftScheduled } from "@/lib/server/posts";
import { generateDraft } from "@/lib/server/ai";
import { generateForCompany } from "@/lib/server/jobs";
import { logActivity } from "@/lib/server/audit";
import { publisherMode } from "@/lib/server/publisher";
import { DATE_RE, findProhibitedWords, PLATFORMS, ROLES, TIME_RE, type Platform } from "@/lib/domain";
import { addDays, isValidTimeZone, localDate, localTime } from "@/lib/tz";

export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  conflict?: boolean;
  warnings?: string[];
  values?: Record<string, string>;
  postId?: string;
  version?: number;
};

function fail(e: unknown): ActionState {
  if (e instanceof AuthzError) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: "Something went wrong on the server. Nothing was changed." };
}

function revalidateAll() {
  for (const p of ["/dashboard", "/calendar", "/approvals", "/compose", "/settings", "/notifications"]) revalidatePath(p, "layout");
}

function formValues(fd: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, String(fd.get(k) ?? "")]));
}

// ------------------------------------------------------------------ auth

const signupSchema = z.object({
  companyName: z.string().trim().min(2, "Enter your company name.").max(100),
  name: z.string().trim().min(1, "Enter your name.").max(100),
  email: z.email("Enter a valid email address.").transform((e) => e.toLowerCase()),
  password: z.string().min(10, "Use at least 10 characters.").max(200),
  timezone: z.string().refine(isValidTimeZone, "Choose a valid time zone."),
});

export async function signupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd, ["companyName", "name", "email", "timezone"]);
  const parsed = signupSchema.safeParse({ ...values, password: fd.get("password") });
  if (!parsed.success) {
    return { ok: false, error: "Fix the highlighted fields.", values, fieldErrors: zodFields(parsed.error) };
  }
  const d = parsed.data;
  if (await db.user.findUnique({ where: { email: d.email } })) {
    return { ok: false, values, fieldErrors: { email: "An account with this email already exists." }, error: "Fix the highlighted fields." };
  }
  const passwordHash = await hashPassword(d.password);
  const user = await db.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: d.companyName,
        timezone: d.timezone,
        channels: { create: PLATFORMS.map((platform) => ({ platform })) },
      },
    });
    const u = await tx.user.create({
      data: { companyId: company.id, name: d.name, email: d.email, passwordHash, role: "admin" },
    });
    await logActivity(tx, { companyId: company.id, actor: u, entityType: "company", entityId: company.id, action: "created workspace" });
    return u;
  });
  await createSession(user.id);
  redirect("/settings?tab=company&welcome=1");
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const values = { email };
  if (!email || !password) {
    return { ok: false, values, error: "Enter your email and password.", fieldErrors: { ...(email ? {} : { email: "Required." }), ...(password ? {} : { password: "Required." }) } };
  }
  const user = await db.user.findUnique({ where: { email } });
  // Same message for unknown email and wrong password to avoid account enumeration.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, values, error: "Email or password is incorrect." };
  }
  if (user.status !== "active") return { ok: false, values, error: "This account is disabled. Contact your workspace admin." };
  await createSession(user.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

function zodFields(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of error.issues) out[i.path.join(".")] ??= i.message;
  return out;
}

// ------------------------------------------------------------------ composer

export type ComposerPayload = {
  id?: string;
  version?: number;
  title: string;
  masterCopy: string;
  source?: "manual" | "ai";
  variants: { platform: Platform; copy: string; mediaUrl?: string | null }[];
};

export async function savePostAction(payload: ComposerPayload, submit: boolean): Promise<ActionState> {
  try {
    const user = await requirePermission("post.edit");
    const r = await savePost(user, payload, { submit });
    if (!r.ok) return { ok: false, error: r.error, fieldErrors: r.fieldErrors, conflict: r.conflict };
    revalidateAll();
    return { ok: true, message: r.message, postId: r.id, version: r.version };
  } catch (e) {
    return fail(e);
  }
}

export type GenerateState =
  | { ok: true; title: string; masterCopy: string; variants: Partial<Record<Platform, string>>; modelRef: string; simulated: boolean; warnings: string[] }
  | { ok: false; error: string };

export async function generateDraftAction(input: { prompt: string; platforms: Platform[]; postId?: string }): Promise<GenerateState> {
  try {
    const user = await requirePermission("post.edit");
    const prompt = input.prompt.trim();
    if (prompt.length < 5) return { ok: false, error: "Describe the post topic in at least a few words." };
    if (prompt.length > 4000) return { ok: false, error: "Keep the brief under 4,000 characters." };
    const company = await db.company.findUniqueOrThrow({ where: { id: user.companyId } });
    const postId = input.postId
      ? (await db.post.findFirst({ where: { id: input.postId, companyId: user.companyId }, select: { id: true } }))?.id
      : undefined;
    const result = await generateDraft({ brand: company, prompt, platforms: input.platforms });
    await db.aiGeneration.create({
      data: {
        companyId: user.companyId,
        postId,
        createdById: user.id,
        prompt,
        modelRef: result.modelRef,
        outputText: result.ok ? result.rawText.slice(0, 20000) : "",
        succeeded: result.ok,
        error: result.ok ? null : result.error,
      },
    });
    if (!result.ok) return { ok: false, error: result.error };
    const flagged = findProhibitedWords(
      [result.draft.masterCopy, ...Object.values(result.draft.variants)].join(" "),
      company.prohibitedWords,
    );
    return {
      ok: true,
      ...result.draft,
      modelRef: result.modelRef,
      simulated: result.simulated,
      warnings: flagged.length ? [`Contains prohibited words: ${flagged.join(", ")}. Edit before submitting.`] : [],
    };
  } catch (e) {
    const f = fail(e);
    return { ok: false, error: f.error! };
  }
}

// ------------------------------------------------------------------ approvals & scheduling

export async function decisionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const command = String(fd.get("command"));
  const comment = String(fd.get("comment") ?? "");
  try {
    if (!["approve", "reject", "request_changes", "submit", "unschedule"].includes(command)) {
      return { ok: false, error: "Unknown action." };
    }
    const user = await requirePermission();
    const r = await decide(user, {
      postId: String(fd.get("postId")),
      version: Number(fd.get("version")),
      command: command as "approve",
      comment,
    });
    if (!r.ok) return { ok: false, error: r.error, fieldErrors: r.fieldErrors, conflict: r.conflict, values: { comment } };
    revalidateAll();
    return { ok: true, message: r.message };
  } catch (e) {
    return { ...fail(e), values: { comment } };
  }
}

export async function commentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const comment = String(fd.get("comment") ?? "");
  try {
    const user = await requirePermission("post.comment");
    const r = await addComment(user, String(fd.get("postId")), comment);
    if (!r.ok) return { ok: false, error: r.error, fieldErrors: r.fieldErrors, values: { comment } };
    revalidateAll();
    return { ok: true, message: r.message };
  } catch (e) {
    return { ...fail(e), values: { comment } };
  }
}

export async function scheduleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd, ["date", "time"]);
  try {
    const user = await requirePermission("post.schedule");
    const r = await schedule(user, {
      postId: String(fd.get("postId")),
      version: Number(fd.get("version")),
      date: values.date,
      time: values.time,
      timeZone: user.company.timezone,
    });
    if (!r.ok) return { ok: false, error: r.error, fieldErrors: r.fieldErrors, conflict: r.conflict, values };
    revalidateAll();
    return { ok: true, message: r.message, warnings: r.warnings };
  } catch (e) {
    return { ...fail(e), values };
  }
}

/** Drag-and-drop: move a scheduled/approved post to a day, keeping its time (or the first preferred time). */
export async function moveToDayAction(input: { postId: string; date: string }): Promise<ActionState> {
  try {
    const user = await requirePermission("post.schedule");
    if (!DATE_RE.test(input.date)) return { ok: false, error: "Invalid date." };
    const post = await db.post.findFirst({ where: { id: input.postId, companyId: user.companyId } });
    if (!post) return { ok: false, error: "Post not found." };
    const company = await db.company.findUniqueOrThrow({ where: { id: user.companyId } });
    const ref = post.scheduledAt ?? post.suggestedAt;
    const time = ref ? localTime(ref, company.timezone) : (company.preferredPublishTimes[0] ?? "09:00");
    const r = await schedule(user, { postId: post.id, version: post.version, date: input.date, time, timeZone: company.timezone });
    if (!r.ok) return { ok: false, error: r.error };
    revalidateAll();
    return { ok: true, message: r.message, warnings: r.warnings };
  } catch (e) {
    return fail(e);
  }
}

export async function bulkShiftAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd, ["days"]);
  try {
    const user = await requirePermission("post.schedule");
    const r = await shiftScheduled(user, {
      postIds: fd.getAll("postIds").map(String),
      days: Number(values.days),
      timeZone: user.company.timezone,
    });
    if (!r.ok) return { ok: false, error: r.error, values };
    revalidateAll();
    return { ok: r.failures.length === 0, message: r.message, warnings: r.failures, values };
  } catch (e) {
    return { ...fail(e), values };
  }
}

// ------------------------------------------------------------------ settings

const companySchema = z.object({
  name: z.string().trim().min(2, "Enter the company name.").max(100),
  industry: z.string().trim().max(100),
  timezone: z.string().refine(isValidTimeZone, "Choose a valid time zone."),
  brandVoice: z.string().trim().max(2000),
  targetAudience: z.string().trim().max(2000),
  campaignGoals: z.string().trim().max(4000),
  prohibitedWords: z.string().trim().max(1000),
  hashtags: z.string().trim().max(500),
});

export async function updateCompanyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd, Object.keys(companySchema.shape));
  try {
    const user = await requirePermission("company.settings");
    const parsed = companySchema.safeParse(values);
    if (!parsed.success) return { ok: false, error: "Fix the highlighted fields.", fieldErrors: zodFields(parsed.error), values };
    await db.$transaction(async (tx) => {
      await tx.company.update({ where: { id: user.companyId }, data: parsed.data });
      await logActivity(tx, { companyId: user.companyId, actor: user, entityType: "company", entityId: user.companyId, action: "updated company profile" });
    });
    revalidateAll();
    return { ok: true, message: "Company profile saved.", values };
  } catch (e) {
    return { ...fail(e), values };
  }
}

export async function updatePostingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd, ["postingCadence", "preferredPublishTimes"]);
  try {
    const user = await requirePermission("company.settings");
    const cadence = Number(values.postingCadence);
    const times = values.preferredPublishTimes.split(/[,\s]+/).filter(Boolean);
    const platforms = fd.getAll("defaultPlatforms").map(String).filter((p): p is Platform => (PLATFORMS as readonly string[]).includes(p));
    const fieldErrors: Record<string, string> = {};
    if (!Number.isInteger(cadence) || cadence < 1 || cadence > 10) fieldErrors.postingCadence = "Enter a whole number from 1 to 10 posts per day.";
    if (!times.length || times.some((t) => !TIME_RE.test(t))) fieldErrors.preferredPublishTimes = "Use 24-hour HH:mm times separated by commas, e.g. 09:00, 17:30.";
    if (!platforms.length) fieldErrors.defaultPlatforms = "Choose at least one platform.";
    if (Object.keys(fieldErrors).length) return { ok: false, error: "Fix the highlighted fields.", fieldErrors, values };
    await db.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: user.companyId },
        data: {
          postingCadence: cadence,
          preferredPublishTimes: [...new Set(times)].sort(),
          defaultPlatforms: platforms,
          autoGenerateEnabled: fd.get("autoGenerateEnabled") === "on",
          autoSubmitForApproval: fd.get("autoSubmitForApproval") === "on",
        },
      });
      await logActivity(tx, { companyId: user.companyId, actor: user, entityType: "company", entityId: user.companyId, action: "updated posting defaults" });
    });
    revalidateAll();
    return { ok: true, message: "Posting defaults saved.", values };
  } catch (e) {
    return { ...fail(e), values };
  }
}

export async function runGenerationNowAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("company.settings");
    const company = await db.company.findUniqueOrThrow({ where: { id: user.companyId } });
    const target = String(fd.get("date") || addDays(localDate(new Date(), company.timezone), 1));
    if (!DATE_RE.test(target)) return { ok: false, error: "Invalid date." };
    const r = await generateForCompany(user.companyId, target, user);
    revalidateAll();
    if (r.created === 0) return { ok: false, error: `No drafts were created. ${r.errors[0] ?? ""}` };
    return {
      ok: r.errors.length === 0,
      message: `Created ${r.created} draft(s) for ${target}.`,
      warnings: r.errors,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function channelAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const platform = String(fd.get("platform")) as Platform;
  const intent = String(fd.get("intent"));
  const accountName = String(fd.get("accountName") ?? "").trim().slice(0, 100);
  try {
    const user = await requirePermission("company.settings");
    if (!(PLATFORMS as readonly string[]).includes(platform)) return { ok: false, error: "Unknown platform." };
    let data: { accountName?: string; connectionStatus?: "connected" | "not_connected"; simulated?: boolean; scopes?: string[]; lastSyncAt?: Date | null; lastError?: string | null };
    let message: string;
    if (intent === "save") {
      data = { accountName };
      message = "Account name saved.";
    } else if (intent === "simulate") {
      if (publisherMode() !== "simulate") return { ok: false, error: "Simulated connections are only available when PUBLISHER_MODE=simulate (development)." };
      data = { connectionStatus: "connected", simulated: true, scopes: ["simulated"], lastSyncAt: new Date(), lastError: null };
      message = "Simulated connection enabled (development only — nothing is posted to the real platform).";
    } else if (intent === "disconnect") {
      data = { connectionStatus: "not_connected", simulated: false, scopes: [], lastSyncAt: null };
      message = "Channel disconnected.";
    } else return { ok: false, error: "Unknown action." };
    await db.$transaction(async (tx) => {
      await tx.channelConnection.upsert({
        where: { companyId_platform: { companyId: user.companyId, platform } },
        create: { companyId: user.companyId, platform, ...data },
        update: data,
      });
      await logActivity(tx, { companyId: user.companyId, actor: user, entityType: "channel", entityId: platform, action: `${intent} channel ${platform}` });
    });
    revalidateAll();
    return { ok: true, message };
  } catch (e) {
    return fail(e);
  }
}

const newUserSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(100),
  email: z.email("Enter a valid email.").transform((e) => e.toLowerCase()),
  role: z.enum(ROLES),
  password: z.string().min(10, "Temporary password must be at least 10 characters.").max(200),
});

export async function createUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd, ["name", "email", "role"]);
  try {
    const admin = await requirePermission("users.manage");
    const parsed = newUserSchema.safeParse({ ...values, password: fd.get("password") });
    if (!parsed.success) return { ok: false, error: "Fix the highlighted fields.", fieldErrors: zodFields(parsed.error), values };
    if (await db.user.findUnique({ where: { email: parsed.data.email } })) {
      return { ok: false, error: "Fix the highlighted fields.", fieldErrors: { email: "This email is already registered." }, values };
    }
    const passwordHash = await hashPassword(parsed.data.password);
    await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { companyId: admin.companyId, name: parsed.data.name, email: parsed.data.email, role: parsed.data.role, passwordHash },
      });
      await logActivity(tx, { companyId: admin.companyId, actor: admin, entityType: "user", entityId: u.id, action: `added user as ${u.role}`, detail: u.email });
    });
    revalidateAll();
    return { ok: true, message: `Added ${parsed.data.name}. Share the temporary password with them through a secure channel.` };
  } catch (e) {
    return { ...fail(e), values };
  }
}

export async function updateUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const admin = await requirePermission("users.manage");
    const userId = String(fd.get("userId"));
    const role = String(fd.get("role"));
    const status = String(fd.get("status"));
    if (!(ROLES as readonly string[]).includes(role) || !["active", "disabled"].includes(status)) return { ok: false, error: "Invalid role or status." };
    const target = await db.user.findFirst({ where: { id: userId, companyId: admin.companyId } });
    if (!target) return { ok: false, error: "User not found." };
    const losingAdmin = target.role === "admin" && (role !== "admin" || status !== "active");
    if (losingAdmin) {
      const admins = await db.user.count({ where: { companyId: admin.companyId, role: "admin", status: "active" } });
      if (admins <= 1) return { ok: false, error: "The workspace needs at least one active admin." };
    }
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { role: role as "admin", status: status as "active" } });
      if (status === "disabled") await tx.session.deleteMany({ where: { userId: target.id } });
      await logActivity(tx, { companyId: admin.companyId, actor: admin, entityType: "user", entityId: target.id, action: `set role ${role}, status ${status}`, detail: target.email });
    });
    revalidateAll();
    return { ok: true, message: `Updated ${target.name}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function markNotificationsReadAction() {
  const user = await requirePermission();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidateAll();
}
