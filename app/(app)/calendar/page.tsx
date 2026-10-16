import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { startOfLocalDay } from "@/lib/server/queries";
import { can, DATE_RE, PLATFORMS, PLATFORM_LABEL, POST_STATUSES, STATUS_LABEL, type Platform, type PostStatus } from "@/lib/domain";
import { addDays, localDate, localTime, weekdayIndex } from "@/lib/tz";
import { Card, EmptyState, Input, PageHeader, Select, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { CalendarGrid, type CalItem } from "./grid";
import { BulkList } from "./bulk-list";
import { PostDrawer } from "./drawer";

export const metadata = { title: "Calendar" };

type SP = { view?: string; date?: string; status?: string; platform?: string; assignee?: string; q?: string; post?: string };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tz = user.company.timezone;
  const view = sp.view === "week" || sp.view === "list" ? sp.view : "month";
  const today = localDate(new Date(), tz);
  const anchor = sp.date && DATE_RE.test(sp.date) ? sp.date : today;
  const status = (POST_STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as PostStatus) : undefined;
  const platform = (PLATFORMS as readonly string[]).includes(sp.platform ?? "") ? (sp.platform as Platform) : undefined;
  const q = sp.q?.trim().slice(0, 100) || undefined;

  const users = await db.user.findMany({ where: { companyId: user.companyId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const assignee = users.some((u) => u.id === sp.assignee) ? sp.assignee : undefined;

  let rangeStart: string;
  let rangeDays: number;
  if (view === "week") {
    rangeStart = addDays(anchor, -weekdayIndex(anchor));
    rangeDays = 7;
  } else {
    const first = `${anchor.slice(0, 7)}-01`;
    rangeStart = addDays(first, -weekdayIndex(first));
    rangeDays = 42;
  }
  const from = startOfLocalDay(rangeStart, tz);
  const to = startOfLocalDay(addDays(rangeStart, rangeDays), tz);

  const where: Prisma.PostWhereInput = {
    companyId: user.companyId,
    ...(status && { status }),
    ...(platform && { variants: { some: { platform } } }),
    ...(assignee && { createdById: assignee }),
    ...(q && { OR: [{ title: { contains: q, mode: "insensitive" } }, { masterCopy: { contains: q, mode: "insensitive" } }] }),
  };
  if (view !== "list") {
    where.AND = [{ OR: [{ scheduledAt: { gte: from, lt: to } }, { scheduledAt: null, suggestedAt: { gte: from, lt: to } }, { scheduledAt: null, publishedAt: { gte: from, lt: to } }] }];
  }

  const posts = await db.post.findMany({
    where,
    include: { variants: { select: { platform: true } }, createdBy: { select: { name: true } } },
    orderBy: [{ scheduledAt: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
    take: view === "list" ? 200 : 500,
  });

  const items: CalItem[] = posts.map((p) => {
    const when = p.scheduledAt ?? p.publishedAt ?? p.suggestedAt;
    return {
      id: p.id,
      title: p.title,
      status: p.status,
      platforms: p.variants.map((v) => v.platform),
      date: when ? localDate(when, tz) : null,
      time: when ? localTime(when, tz) : null,
      suggested: !p.scheduledAt && !p.publishedAt && !!p.suggestedAt,
      author: p.createdBy.name,
      version: p.version,
    };
  });

  const qs = (patch: Partial<SP>) => {
    const next = { view, date: anchor, status, platform, assignee, q, ...patch };
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) u.set(k, v);
    return `/calendar?${u.toString()}`;
  };
  const step = view === "week" ? 7 : 0;
  const prev = view === "week" ? addDays(anchor, -step) : shiftMonth(anchor, -1);
  const next = view === "week" ? addDays(anchor, step) : shiftMonth(anchor, 1);
  const filtered = Boolean(status || platform || assignee || q);
  const days = Array.from({ length: rangeDays }, (_, i) => addDays(rangeStart, i));
  const heading =
    view === "week"
      ? `${fmt(rangeStart, { day: "numeric", month: "short" })} – ${fmt(addDays(rangeStart, 6), { day: "numeric", month: "short", year: "numeric" })}`
      : fmt(`${anchor.slice(0, 7)}-01`, { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader
        title="Content calendar"
        description={`All times in ${tz}. ${can(user.role, "post.schedule") ? "Drag a scheduled or approved post to another day to reschedule it." : ""}`}
        action={can(user.role, "post.edit") ? <Link href="/compose" className={buttonClass()}>New post</Link> : undefined}
      />

      <form method="get" action="/calendar" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white p-4 shadow-sm" role="search" aria-label="Filter posts">
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="date" value={anchor} />
        <label className="min-w-40 flex-1 text-sm">
          <span className="mb-1 block font-medium">Search</span>
          <Input name="q" defaultValue={q} placeholder="Title or text" type="search" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Status</span>
          <Select name="status" defaultValue={status ?? ""}>
            <option value="">All statuses</option>
            {POST_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Channel</span>
          <Select name="platform" defaultValue={platform ?? ""}>
            <option value="">All channels</option>
            {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Author</span>
          <Select name="assignee" defaultValue={assignee ?? ""}>
            <option value="">Everyone</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </label>
        <button type="submit" className={buttonClass("secondary")}>Apply</button>
        {filtered && <Link href={`/calendar?view=${view}&date=${anchor}`} className={buttonClass("ghost")}>Clear filters</Link>}
      </form>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {view !== "list" && (
            <>
              <Link href={qs({ date: prev })} className={buttonClass("secondary", "sm")} aria-label={`Previous ${view}`}><ChevronLeft aria-hidden className="size-4" /></Link>
              <Link href={qs({ date: today })} className={buttonClass("secondary", "sm")}>Today</Link>
              <Link href={qs({ date: next })} className={buttonClass("secondary", "sm")} aria-label={`Next ${view}`}><ChevronRight aria-hidden className="size-4" /></Link>
              <h2 className="ml-2 text-lg font-semibold" aria-live="polite">{heading}</h2>
            </>
          )}
        </div>
        <div role="group" aria-label="View" className="inline-flex rounded-lg border border-line bg-white p-0.5 shadow-sm">
          {(["month", "week", "list"] as const).map((v) => (
            <Link key={v} href={qs({ view: v })} aria-current={view === v ? "page" : undefined} className={cn("rounded-md px-3 py-1.5 text-sm font-medium capitalize", view === v ? "bg-brand-600 text-white" : "text-muted hover:text-ink")}>
              {v}
            </Link>
          ))}
        </div>
      </div>

      {items.length === 0 && (
        <Card className="mb-4">
          <EmptyState
            title={filtered ? "No posts match these filters" : view === "list" ? "No posts yet" : "Nothing planned in this period"}
            description={filtered ? "Try another status or channel, or clear the filters." : "Create a post or enable daily AI drafts in settings."}
            action={filtered ? <Link href={`/calendar?view=${view}&date=${anchor}`} className={buttonClass("secondary", "sm")}>Clear filters</Link> : undefined}
          />
        </Card>
      )}

      {view === "list" ? (
        items.length > 0 && <BulkList items={items} canSchedule={can(user.role, "post.schedule")} baseHref={qs({ post: undefined })} />
      ) : (
        <CalendarGrid
          days={days}
          today={today}
          monthKey={view === "month" ? anchor.slice(0, 7) : null}
          items={items}
          canSchedule={can(user.role, "post.schedule")}
          baseHref={qs({ post: undefined })}
        />
      )}

      {sp.post && <PostDrawer postId={sp.post} closeHref={qs({ post: undefined })} />}
    </>
  );
}

function shiftMonth(dateKey: string, delta: number) {
  const [y, m] = dateKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function fmt(dateKey: string, opts: Intl.DateTimeFormatOptions) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}
