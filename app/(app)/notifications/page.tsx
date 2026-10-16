import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { markNotificationsReadAction } from "@/app/actions";
import { formatDateTime } from "@/lib/tz";
import { Card, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader
        title="Notifications"
        description="In-app notifications only. Email and push delivery are not configured."
        action={unread > 0 ? <form action={markNotificationsReadAction}><button type="submit" className={buttonClass("secondary", "sm")}>Mark all as read</button></form> : undefined}
      />
      <Card>
        {items.length === 0 ? (
          <EmptyState title="No notifications" description="You will be notified about approvals, review decisions and failed publishes." />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id} className={cn("flex items-start gap-3 px-5 py-3", !n.readAt && "bg-brand-50/50")}>
                <span aria-hidden className={cn("mt-2 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand-600")} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm break-words">{!n.readAt && <span className="sr-only">Unread: </span>}{n.message}</p>
                  <p className="text-xs text-muted">{formatDateTime(n.createdAt, user.company.timezone)}</p>
                </div>
                {n.postId && <Link href={`/approvals?post=${n.postId}`} className="text-sm font-medium text-brand-700 hover:underline">Open</Link>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
