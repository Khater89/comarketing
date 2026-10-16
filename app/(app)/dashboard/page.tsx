import Link from "next/link";
import { CalendarClock, Plug, SquarePen, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { startOfLocalDay, statusCounts, weekStartKey } from "@/lib/server/queries";
import { can, PLATFORM_LABEL, POST_STATUSES, STATUS_LABEL } from "@/lib/domain";
import { addDays, formatDateTime, formatShortDate, localDate, localTime } from "@/lib/tz";
import { Card, CardHeader, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { PlatformTag, SourceTag, StatusChip } from "@/components/status";
import { AutoRefresh } from "@/components/auto-refresh";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const tz = user.company.timezone;
  const now = new Date();
  const today = localDate(now, tz);
  const weekStart = startOfLocalDay(weekStartKey(now, tz), tz);
  const horizon = startOfLocalDay(addDays(today, 7), tz);

  const [counts, publishedThisWeek, upcoming, queue, failed, channels] = await Promise.all([
    statusCounts(user.companyId),
    db.post.count({ where: { companyId: user.companyId, status: "published", publishedAt: { gte: weekStart } } }),
    db.post.findMany({
      where: { companyId: user.companyId, status: "scheduled", scheduledAt: { gte: now, lt: horizon } },
      include: { variants: { select: { platform: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    db.post.findMany({
      where: { companyId: user.companyId, status: "pending_approval" },
      include: { createdBy: { select: { name: true } }, variants: { select: { platform: true } } },
      orderBy: { updatedAt: "asc" },
      take: 8,
    }),
    db.post.findMany({ where: { companyId: user.companyId, status: "failed" }, orderBy: { lastAttemptAt: "desc" }, take: 5 }),
    db.channelConnection.findMany({ where: { companyId: user.companyId }, orderBy: { platform: "asc" } }),
  ]);

  const kpis = [
    { label: "Drafts", value: counts.draft + counts.rejected, hint: `${counts.rejected} rejected`, href: "/calendar?view=list&status=draft" },
    { label: "Pending approval", value: counts.pending_approval, hint: "awaiting a reviewer", href: "/approvals" },
    { label: "Scheduled", value: counts.scheduled, hint: `${counts.approved} approved, not scheduled`, href: "/calendar?view=list&status=scheduled" },
    { label: "Published this week", value: publishedThisWeek, hint: `since Mon ${formatShortDate(weekStartKey(now, tz)).slice(4)}`, href: "/calendar?view=list&status=published" },
  ];
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const total = POST_STATUSES.reduce((s, k) => s + counts[k], 0);
  const max = Math.max(1, ...POST_STATUSES.map((s) => counts[s]));

  return (
    <>
      <AutoRefresh seconds={20} />
      <PageHeader
        title={`Good to see you, ${user.name.split(" ")[0]}`}
        description={<>Publishing overview for {user.company.name}. Times shown in {tz}.</>}
        action={can(user.role, "post.edit") ? <Link href="/compose" className={buttonClass()}><SquarePen aria-hidden className="size-4" /> New post</Link> : undefined}
      />

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className="rounded-xl border border-line bg-white p-4 shadow-sm transition-colors hover:border-brand-200">
            <p className="text-sm text-muted">{k.label}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{k.value}</p>
            <p className="mt-1 text-xs text-muted">{k.hint}</p>
          </Link>
        ))}
      </section>

      {failed.length > 0 && (
        <Card className="mt-6 border-red-200">
          <CardHeader title={`${counts.failed} failed post${counts.failed === 1 ? "" : "s"}`} description="These need attention. Fix the cause, then reschedule." />
          <ul className="divide-y divide-line">
            {failed.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-red-700" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.title}</p>
                  <p className="text-sm text-red-800">{p.failureReason}</p>
                  <p className="text-xs text-muted">
                    Attempts: {p.publishAttempts}
                    {p.lastAttemptAt && <> · last attempt {formatDateTime(p.lastAttemptAt, tz)}</>}
                  </p>
                </div>
                <Link href={`/approvals?post=${p.id}`} className={buttonClass("secondary", "sm")}>Review &amp; retry</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-6 grid gap-6 grid-cols-1 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Next 7 days" description="Scheduled posts by day" action={<Link href="/calendar?view=week" className="text-sm font-medium text-brand-700 hover:underline">Open calendar</Link>} />
          <ol className="grid grid-cols-1 gap-px bg-line sm:grid-cols-7">
            {days.map((d) => {
              const items = upcoming.filter((p) => p.scheduledAt && localDate(p.scheduledAt, tz) === d);
              return (
                <li key={d} className="bg-white p-3 sm:min-h-28">
                  <p className={d === today ? "text-xs font-semibold text-brand-700" : "text-xs font-medium text-muted"}>
                    {d === today ? "Today" : formatShortDate(d)}
                  </p>
                  {items.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-400">Nothing scheduled</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {items.map((p) => (
                        <li key={p.id}>
                          <Link href={`/calendar?post=${p.id}`} className="block rounded-md bg-brand-50 px-2 py-1 text-xs text-brand-800 hover:bg-brand-100">
                            <span className="font-semibold tabular-nums">{localTime(p.scheduledAt!, tz)}</span> {p.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </Card>

        <Card>
          <CardHeader title="Connected channels" action={<Link href="/settings?tab=channels" className="text-sm font-medium text-brand-700 hover:underline">Manage</Link>} />
          <ul className="divide-y divide-line">
            {channels.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                <Plug aria-hidden className="size-4 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{PLATFORM_LABEL[c.platform]}{c.accountName && <span className="font-normal text-muted"> · {c.accountName}</span>}</p>
                  <p className="text-xs text-muted">{c.lastSyncAt ? `Last checked ${formatDateTime(c.lastSyncAt, tz)}` : "Never connected"}</p>
                </div>
                <span className={c.connectionStatus === "connected" ? "text-xs font-medium text-emerald-800" : "text-xs font-medium text-slate-600"}>
                  {c.connectionStatus === "connected" ? (c.simulated ? "Connected (simulated)" : "Connected") : c.connectionStatus.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 grid-cols-1 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Approval queue" description="Oldest first" action={<Link href="/approvals" className="text-sm font-medium text-brand-700 hover:underline">Open inbox</Link>} />
          {queue.length === 0 ? (
            <EmptyState title="No posts waiting for approval" description="Drafts submitted for review will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="px-5 py-2 font-medium">Post</th>
                    <th scope="col" className="px-3 py-2 font-medium">Platforms</th>
                    <th scope="col" className="px-3 py-2 font-medium">Author</th>
                    <th scope="col" className="px-5 py-2 font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {queue.map((p) => (
                    <tr key={p.id}>
                      <td className="px-5 py-3">
                        <p className="font-medium">{p.title}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5"><StatusChip status={p.status} /><SourceTag source={p.source} /></div>
                      </td>
                      <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{p.variants.map((v) => <PlatformTag key={v.platform} platform={v.platform} />)}</div></td>
                      <td className="px-3 py-3 text-muted">{p.createdBy.name}</td>
                      <td className="px-5 py-3 text-right">
                        <Link href={`/approvals?post=${p.id}`} className={buttonClass(can(user.role, "post.approve") ? "primary" : "secondary", "sm")}>
                          {can(user.role, "post.approve") ? "Review" : "View"}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Posts by status" description={`${total} post${total === 1 ? "" : "s"} in total`} />
          {total === 0 ? (
            <EmptyState title="No posts yet" description="Create your first post or enable daily AI drafts in settings." />
          ) : (
            <div className="px-5 py-4">
              <ul className="space-y-2.5" aria-label="Number of posts in each status">
                {POST_STATUSES.map((s) => (
                  <li key={s} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-2 text-sm" title={`${STATUS_LABEL[s]}: ${counts[s]}`}>
                    <span className="text-muted">{STATUS_LABEL[s]}</span>
                    <span className="h-3 rounded-r bg-slate-100" aria-hidden>
                      <span className="block h-3 rounded-r bg-brand-600" style={{ width: `${(counts[s] / max) * 100}%` }} />
                    </span>
                    <span className="text-right font-medium tabular-nums">{counts[s]}</span>
                  </li>
                ))}
              </ul>
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer text-brand-700">Show as table</summary>
                <table className="mt-2 w-full text-left">
                  <thead><tr className="border-b border-line text-xs text-muted"><th scope="col" className="py-1 font-medium">Status</th><th scope="col" className="py-1 text-right font-medium">Posts</th></tr></thead>
                  <tbody>{POST_STATUSES.map((s) => <tr key={s} className="border-b border-line/60"><td className="py-1">{STATUS_LABEL[s]}</td><td className="py-1 text-right tabular-nums">{counts[s]}</td></tr>)}</tbody>
                </table>
              </details>
            </div>
          )}
          <p className="flex items-center gap-1.5 border-t border-line px-5 py-3 text-xs text-muted">
            <CalendarClock aria-hidden className="size-3.5" /> Counts come directly from saved posts and refresh every 20 seconds.
          </p>
        </Card>
      </div>
    </>
  );
}
