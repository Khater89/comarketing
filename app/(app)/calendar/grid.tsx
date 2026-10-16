"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveToDayAction } from "@/app/actions";
import { PLATFORM_LABEL, STATUS_LABEL, type Platform, type PostStatus } from "@/lib/domain";
import { formatShortDate } from "@/lib/tz";
import { StatusChip } from "@/components/status";
import { cn } from "@/lib/utils";

export type CalItem = {
  id: string;
  title: string;
  status: PostStatus;
  platforms: Platform[];
  date: string | null;
  time: string | null;
  suggested: boolean;
  author: string;
  version: number;
};

const chip: Record<PostStatus, string> = {
  draft: "border-slate-300 bg-slate-50 text-slate-800",
  pending_approval: "border-amber-300 bg-amber-50 text-amber-900",
  approved: "border-sky-300 bg-sky-50 text-sky-900",
  rejected: "border-rose-300 bg-rose-50 text-rose-900",
  scheduled: "border-brand-200 bg-brand-50 text-brand-800",
  published: "border-emerald-300 bg-emerald-50 text-emerald-900",
  failed: "border-red-300 bg-red-50 text-red-900",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarGrid({ days, today, monthKey, items, canSchedule, baseHref }: { days: string[]; today: string; monthKey: string | null; items: CalItem[]; canSchedule: boolean; baseHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const href = (id: string) => `${baseHref}${baseHref.includes("?") ? "&" : "?"}post=${id}`;
  const draggable = (i: CalItem) => canSchedule && (i.status === "scheduled" || i.status === "approved");

  const drop = (date: string, id: string) => {
    setOver(null);
    const item = items.find((i) => i.id === id);
    if (!item || item.date === date) return;
    if (date < today) {
      setMsg({ ok: false, text: "Posts cannot be moved into the past." });
      return;
    }
    start(async () => {
      const r = await moveToDayAction({ postId: id, date });
      setMsg(r.ok ? { ok: true, text: `${item.title}: ${r.message}${r.warnings?.length ? ` ${r.warnings.join(" ")}` : ""}` } : { ok: false, text: r.error ?? "Could not move the post." });
      router.refresh();
    });
  };

  const byDay = (d: string) => items.filter((i) => i.date === d).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));

  return (
    <div>
      <div aria-live="polite" className="mb-3 min-h-0">
        {pending && <p className="text-sm text-muted">Rescheduling…</p>}
        {msg && !pending && <p role={msg.ok ? "status" : "alert"} className={cn("rounded-lg border px-3 py-2 text-sm", msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>{msg.text}</p>}
      </div>

      {/* Desktop/tablet grid */}
      <div className="hidden overflow-hidden rounded-xl border border-line bg-line shadow-sm md:block">
        <div className="grid grid-cols-7 gap-px">
          {WEEKDAYS.map((w) => <div key={w} className="bg-slate-50 px-2 py-2 text-xs font-semibold text-muted">{w}</div>)}
          {days.map((d) => {
            const list = byDay(d);
            const outside = monthKey && !d.startsWith(monthKey);
            return (
              <div
                key={d}
                onDragOver={(e) => { if (canSchedule && d >= today) { e.preventDefault(); setOver(d); } }}
                onDragLeave={() => setOver((o) => (o === d ? null : o))}
                onDrop={(e) => { e.preventDefault(); drop(d, e.dataTransfer.getData("text/plain")); }}
                className={cn("bg-white p-1.5 transition-colors", monthKey ? "min-h-28" : "min-h-72", outside && "bg-slate-50/70", over === d && "bg-brand-50 ring-2 ring-brand-600 ring-inset")}
              >
                <p className={cn("mb-1 text-xs tabular-nums", d === today ? "inline-flex size-6 items-center justify-center rounded-full bg-brand-600 font-semibold text-white" : outside ? "text-slate-400" : "text-muted")}>
                  {Number(d.slice(8))}
                  <span className="sr-only"> {formatShortDate(d)}</span>
                </p>
                <ul className="space-y-1">
                  {list.map((i) => (
                    <li key={i.id}>
                      <Link
                        href={href(i.id)}
                        scroll={false}
                        draggable={draggable(i)}
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", i.id); e.dataTransfer.effectAllowed = "move"; }}
                        title={`${i.title} — ${STATUS_LABEL[i.status]}${i.suggested ? " (suggested time)" : ""} · ${i.platforms.map((p) => PLATFORM_LABEL[p]).join(", ")}`}
                        className={cn("block truncate rounded-md border px-1.5 py-1 text-xs", chip[i.status], i.suggested && "border-dashed", draggable(i) && "cursor-grab active:cursor-grabbing")}
                      >
                        <span className="font-semibold tabular-nums">{i.time}</span> {i.title}
                        <span className="sr-only">, {STATUS_LABEL[i.status]}{i.suggested ? ", suggested time" : ""}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* Small screens: agenda list */}
      <ol className="space-y-3 md:hidden" aria-label="Agenda">
        {days.filter((d) => (!monthKey || d.startsWith(monthKey)) && byDay(d).length).map((d) => (
          <li key={d} className="rounded-xl border border-line bg-white shadow-sm">
            <p className={cn("border-b border-line px-4 py-2 text-sm font-semibold", d === today && "text-brand-700")}>{d === today ? "Today · " : ""}{formatShortDate(d)}</p>
            <ul className="divide-y divide-line">
              {byDay(d).map((i) => (
                <li key={i.id}>
                  <Link href={href(i.id)} scroll={false} className="flex items-start gap-3 px-4 py-3">
                    <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">{i.time}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{i.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted"><StatusChip status={i.status} />{i.suggested && "suggested"} {i.platforms.map((p) => PLATFORM_LABEL[p]).join(", ")}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">Dashed outline = suggested time from daily AI drafts (not yet scheduled). Keyboard users: open a post and use its schedule form to reschedule.</p>
    </div>
  );
}
