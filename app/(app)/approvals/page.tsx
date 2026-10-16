import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { can, type PostStatus } from "@/lib/domain";
import { formatDateTime } from "@/lib/tz";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { PlatformTag, SourceTag, StatusChip } from "@/components/status";
import { AutoRefresh } from "@/components/auto-refresh";
import { ReviewPane } from "./review-pane";
import { cn } from "@/lib/utils";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ post?: string }> }) {
  const user = await requireUser();
  const { post: selectedId } = await searchParams;
  const tz = user.company.timezone;
  const reviewer = can(user.role, "post.approve");

  const posts = await db.post.findMany({
    where: { companyId: user.companyId, status: { in: ["pending_approval", "rejected", "approved", "failed", "draft"] } },
    include: { createdBy: { select: { name: true } }, variants: { select: { platform: true } }, approvalActions: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { updatedAt: "asc" },
    take: 300,
  });

  const returned = (p: (typeof posts)[number]) =>
    p.status === "rejected" || (p.status === "draft" && p.approvalActions[0]?.action === "request_changes");

  const groups: { key: string; title: string; description: string; items: typeof posts }[] = [
    { key: "pending", title: reviewer ? "Needs your review" : "Waiting for review", description: "Oldest first", items: posts.filter((p) => p.status === "pending_approval") },
    {
      key: "returned",
      title: reviewer ? "Returned to authors" : "Returned to you",
      description: "Rejected or changes requested",
      items: posts.filter((p) => returned(p) && (reviewer || user.role !== "creator" || p.createdById === user.id)),
    },
    { key: "approved", title: "Approved — not scheduled", description: "Ready to schedule", items: posts.filter((p) => p.status === "approved") },
    { key: "failed", title: "Failed to publish", description: "Fix and reschedule", items: posts.filter((p) => p.status === "failed") },
  ];
  if (!reviewer) groups.unshift(groups.splice(1, 1)[0]);

  const firstId = selectedId ?? groups.find((g) => g.items.length)?.items[0]?.id;

  return (
    <>
      <AutoRefresh seconds={15} />
      <PageHeader title="Approvals" description={reviewer ? "Review AI and team drafts before anything is scheduled." : "Track review decisions on your posts."} />
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <nav aria-label="Review queue" className="space-y-4">
          {groups.map((g) => (
            <Card key={g.key}>
              <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold">{g.title}</h2>
                <span className="text-xs text-muted">{g.items.length}</span>
              </div>
              {g.items.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted">Nothing here.</p>
              ) : (
                <ul className="max-h-96 divide-y divide-line overflow-y-auto">
                  {g.items.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/approvals?post=${p.id}`}
                        aria-current={p.id === firstId ? "true" : undefined}
                        className={cn("block px-4 py-3 hover:bg-slate-50", p.id === firstId && "bg-brand-50 hover:bg-brand-50")}
                      >
                        <p className="truncate text-sm font-medium">{p.title}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <StatusChip status={p.status as PostStatus} />
                          <SourceTag source={p.source} />
                          {p.variants.map((v) => <PlatformTag key={v.platform} platform={v.platform} />)}
                        </div>
                        <p className="mt-1 text-xs text-muted">{p.createdBy.name} · updated {formatDateTime(p.updatedAt, tz)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </nav>
        <div>
          {firstId ? (
            <ReviewPane postId={firstId} />
          ) : (
            <Card><EmptyState title="Your inbox is clear" description="When someone submits a post for approval it appears here within a few seconds." /></Card>
          )}
        </div>
      </div>
    </>
  );
}
