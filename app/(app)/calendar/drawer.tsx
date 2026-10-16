import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { can, PLATFORM_LABEL } from "@/lib/domain";
import { formatDateTime } from "@/lib/tz";
import { buttonClass } from "@/components/ui";
import { PlatformTag, SourceTag, StatusChip } from "@/components/status";
import { DrawerShell } from "./drawer-shell";

export async function PostDrawer({ postId, closeHref }: { postId: string; closeHref: string }) {
  const user = await requireUser();
  const post = await db.post.findFirst({
    where: { id: postId, companyId: user.companyId },
    include: { variants: true, createdBy: { select: { name: true } } },
  });
  const tz = user.company.timezone;
  const activity = post
    ? await db.activityLog.findMany({ where: { companyId: user.companyId, entityType: "post", entityId: post.id }, orderBy: { createdAt: "desc" }, take: 15 })
    : [];
  return (
    <DrawerShell closeHref={closeHref} title={post?.title ?? "Post not found"}>
      {!post ? (
        <p className="text-sm text-muted">This post does not exist in your workspace.</p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <StatusChip status={post.status} simulated={post.publishedVia === "simulated"} />
            <SourceTag source={post.source} />
            {post.variants.map((v) => <PlatformTag key={v.id} platform={v.platform} />)}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted">Author</dt><dd>{post.createdBy.name}</dd></div>
            <div><dt className="text-xs text-muted">{post.scheduledAt ? "Scheduled" : post.publishedAt ? "Published" : "Suggested"}</dt><dd>{(post.scheduledAt ?? post.publishedAt ?? post.suggestedAt) ? formatDateTime((post.scheduledAt ?? post.publishedAt ?? post.suggestedAt)!, tz) : "—"}</dd></div>
          </dl>
          {post.failureReason && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{post.failureReason}</p>}
          <div className="space-y-3">
            {post.variants.map((v) => (
              <div key={v.id} className="rounded-lg border border-line p-3">
                <p className="text-xs font-medium text-muted">{PLATFORM_LABEL[v.platform]}{v.publishStatus && ` · ${v.publishStatus}`}</p>
                <p className="mt-1 line-clamp-6 text-sm whitespace-pre-wrap">{v.copy || "—"}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/approvals?post=${post.id}`} className={buttonClass("primary", "sm")}>Review, schedule &amp; comments</Link>
            {can(user.role, "post.edit") && post.status !== "published" && <Link href={`/compose/${post.id}`} className={buttonClass("secondary", "sm")}>Edit</Link>}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Timeline</h3>
            <ol className="space-y-2 border-l border-line pl-4">
              {activity.map((a) => (
                <li key={a.id} className="text-sm">
                  <p><span className="font-medium">{a.actorName}</span> {a.action}</p>
                  {a.detail && <p className="text-xs break-words text-muted">{a.detail}</p>}
                  <p className="text-xs text-muted">{formatDateTime(a.createdAt, tz)}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </DrawerShell>
  );
}
