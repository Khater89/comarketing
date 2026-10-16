import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { allowedCommands, can, PLATFORM_LABEL, type Platform } from "@/lib/domain";
import { addDays, formatDateTime, localDate, localTime } from "@/lib/tz";
import { diffWords } from "@/lib/diff";
import { Card, CardHeader, EmptyState, buttonClass } from "@/components/ui";
import { PlatformTag, SourceTag, StatusChip } from "@/components/status";
import { PlatformPreview } from "@/components/platform-preview";
import { ScheduleForm } from "@/components/schedule-form";
import { CommentForm, DecisionForm } from "./forms";

type Snapshot = { platform: Platform; copy: string; mediaUrl: string | null }[];

export async function ReviewPane({ postId }: { postId: string }) {
  const user = await requireUser();
  const post = await db.post.findFirst({
    where: { id: postId, companyId: user.companyId },
    include: {
      variants: true,
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      revisions: { orderBy: { version: "desc" }, take: 2 },
      approvalActions: { include: { actor: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      aiGenerations: { orderBy: { createdAt: "desc" }, take: 1, select: { modelRef: true, createdAt: true } },
    },
  });
  if (!post) return <Card><EmptyState title="Post not found" description="It may have been removed, or it belongs to another workspace." /></Card>;

  const [company, channels, activity] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: user.companyId } }),
    db.channelConnection.findMany({ where: { companyId: user.companyId } }),
    db.activityLog.findMany({ where: { companyId: user.companyId, entityType: "post", entityId: post.id }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const tz = company.timezone;
  const commands = allowedCommands(post.status, user.role);
  const decisions = commands.filter((c) => c === "approve" || c === "reject" || c === "request_changes") as ("approve" | "reject" | "request_changes")[];
  const [current, previous] = post.revisions;
  const ref = post.scheduledAt ?? post.suggestedAt;
  const lastDecision = [...post.approvalActions].reverse().find((a) => ["approve", "reject", "request_changes", "schedule", "unschedule"].includes(a.action));
  const scheduleDefault = ref && ref > new Date() ? ref : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={post.title}
          description={
            <span className="mt-1 flex flex-wrap items-center gap-2">
              <StatusChip status={post.status} simulated={post.publishedVia === "simulated"} />
              <SourceTag source={post.source} />
              {post.variants.map((v) => <PlatformTag key={v.platform} platform={v.platform} />)}
            </span>
          }
          action={can(user.role, "post.edit") && post.status !== "published" ? <Link href={`/compose/${post.id}`} className={buttonClass("secondary", "sm")}>Edit</Link> : undefined}
        />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-muted">Author</dt><dd>{post.createdBy.name}</dd></div>
          <div><dt className="text-xs text-muted">Approved by</dt><dd>{post.approvedBy?.name ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted">{post.scheduledAt ? "Scheduled" : "Suggested time"}</dt><dd>{ref ? formatDateTime(ref, tz) : "—"}</dd></div>
          <div><dt className="text-xs text-muted">Revision</dt><dd>v{current?.version ?? 1}{post.aiGenerations[0] && <span className="text-muted"> · AI: {post.aiGenerations[0].modelRef}</span>}</dd></div>
        </dl>
        {lastDecision && (
          <p role="status" className="mx-5 mb-4 rounded-lg border border-line bg-slate-50 px-4 py-2 text-sm">
            Latest decision: <strong>{{ approve: "Approved", reject: "Rejected", request_changes: "Changes requested", schedule: "Scheduled", unschedule: "Unscheduled" }[lastDecision.action as "approve"]}</strong> by {lastDecision.actor.name} · {formatDateTime(lastDecision.createdAt, tz)}
            {lastDecision.comment && lastDecision.action !== "schedule" && <span className="block text-muted">“{lastDecision.comment}”</span>}
          </p>
        )}
        {post.status === "failed" && (
          <div role="alert" className="mx-5 mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-medium">Publishing failed after {post.publishAttempts} attempt(s){post.lastAttemptAt && `, last at ${formatDateTime(post.lastAttemptAt, tz)}`}.</p>
            <p>{post.failureReason}</p>
            <ul className="mt-1 list-disc pl-5">
              {post.variants.map((v) => <li key={v.id}>{PLATFORM_LABEL[v.platform]}: {v.publishStatus === "published" ? "published (will not be re-sent)" : v.publishError ?? "not attempted"}</li>)}
            </ul>
          </div>
        )}
      </Card>

      <div className="grid gap-6 grid-cols-1 2xl:grid-cols-2">
        <Card>
          <CardHeader title="Preview" />
          <div className="space-y-4 p-5">
            {post.variants.length === 0 ? <p className="text-sm text-muted">No platform variants.</p> : post.variants.map((v) => (
              <PlatformPreview key={v.id} platform={v.platform} copy={v.copy} mediaUrl={v.mediaUrl} accountName={channels.find((c) => c.platform === v.platform)?.accountName} companyName={company.name} />
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          {decisions.length > 0 && (
            <Card>
              <CardHeader title="Decision" description="Approve to allow scheduling. Rejecting or requesting changes sends it back to the author with your comment." />
              <div className="p-5"><DecisionForm postId={post.id} version={post.version} commands={decisions} /></div>
            </Card>
          )}
          {post.status === "pending_approval" && decisions.length === 0 && (
            <Card><p className="px-5 py-4 text-sm text-muted">Waiting for an approver or admin. Your role cannot approve posts.</p></Card>
          )}

          {commands.includes("schedule") && (
            <Card>
              <CardHeader title={post.status === "scheduled" ? "Reschedule" : post.status === "failed" ? "Retry: schedule again" : "Schedule"} />
              <div className="p-5">
                <ScheduleForm
                  postId={post.id}
                  version={post.version}
                  timeZone={tz}
                  defaultDate={scheduleDefault ? localDate(scheduleDefault, tz) : addDays(localDate(new Date(), tz), 1)}
                  defaultTime={scheduleDefault ? localTime(scheduleDefault, tz) : (company.preferredPublishTimes[0] ?? "09:00")}
                  preferredTimes={company.preferredPublishTimes}
                  isScheduled={post.status === "scheduled"}
                />
              </div>
            </Card>
          )}

          {previous && current && (
            <Card>
              <CardHeader title={`Changes: v${previous.version} → v${current.version}`} description="Added text is underlined in green, removed text is struck through in red." />
              <div className="space-y-4 p-5 text-sm">
                <RevisionDiff label="Title" before={previous.title} after={current.title} />
                <RevisionDiff label="Core message" before={previous.masterCopy} after={current.masterCopy} />
                {[...new Set([...(previous.variants as Snapshot), ...(current.variants as Snapshot)].map((v) => v.platform))].map((p) => {
                  const b = (previous.variants as Snapshot).find((v) => v.platform === p);
                  const a = (current.variants as Snapshot).find((v) => v.platform === p);
                  return (
                    <div key={p} className="space-y-4">
                      <RevisionDiff label={`${PLATFORM_LABEL[p]}${!b ? " (added)" : !a ? " (removed)" : ""}`} before={b?.copy ?? ""} after={a?.copy ?? ""} />
                      <RevisionDiff label={`${PLATFORM_LABEL[p]} media URL`} before={b?.mediaUrl ?? ""} after={a?.mediaUrl ?? ""} />
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 2xl:grid-cols-2">
        <Card>
          <CardHeader title="Comments" />
          <ul className="divide-y divide-line">
            {post.approvalActions.filter((a) => a.comment || a.action !== "comment").length === 0 && <li className="px-5 py-4 text-sm text-muted">No comments yet.</li>}
            {post.approvalActions.map((a) => (
              <li key={a.id} className="px-5 py-3 text-sm">
                <p className="text-xs text-muted"><span className="font-medium text-ink">{a.actor.name}</span> · {a.action.replace("_", " ")} · {formatDateTime(a.createdAt, tz)}</p>
                {a.comment && <p className="mt-1 whitespace-pre-wrap break-words">{a.comment}</p>}
              </li>
            ))}
          </ul>
          {can(user.role, "post.comment") && <div className="border-t border-line p-5"><CommentForm postId={post.id} /></div>}
        </Card>

        <Card>
          <CardHeader title="Activity log" />
          <ol className="divide-y divide-line">
            {activity.map((a) => (
              <li key={a.id} className="px-5 py-2.5 text-sm">
                <p><span className="font-medium">{a.actorName}</span> {a.action}{a.outcome === "failure" && <span className="font-medium text-red-700"> (failed)</span>}</p>
                {a.detail && <p className="text-xs break-words text-muted">{a.detail}</p>}
                <p className="text-xs text-muted">{formatDateTime(a.createdAt, tz)}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}

function RevisionDiff({ label, before, after }: { label: string; before: string; after: string }) {
  if (before === after) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 leading-relaxed">
        {diffWords(before, after).map((part, i) =>
          part.kind === "same" ? <span key={i}>{part.text}</span> : part.kind === "added" ? (
            <ins key={i} className="bg-emerald-100 text-emerald-900 underline decoration-emerald-700"><span className="sr-only">[added: </span>{part.text}<span className="sr-only">]</span></ins>
          ) : (
            <del key={i} className="bg-red-100 text-red-900"><span className="sr-only">[removed: </span>{part.text}<span className="sr-only">]</span></del>
          ),
        )}
      </p>
    </div>
  );
}
