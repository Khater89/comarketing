"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, CalendarDays, Inbox, LayoutDashboard, LogOut, Menu, Settings, SquarePen, X } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { ROLE_LABEL, can, type Role } from "@/lib/domain";
import { cn } from "@/lib/utils";

export function Sidebar({ user, unread, pending }: { user: { name: string; role: Role; companyName: string }; unread: number; pending: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const nav = [
    { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
    ...(can(user.role, "post.edit") ? [{ href: "/compose", label: "Composer", Icon: SquarePen }] : []),
    { href: "/calendar", label: "Calendar", Icon: CalendarDays },
    { href: "/approvals", label: "Approvals", Icon: Inbox, count: pending },
    { href: "/notifications", label: "Notifications", Icon: Bell, count: unread },
    { href: "/settings", label: "Settings", Icon: Settings },
  ];

  const content = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <p className="text-lg font-semibold tracking-tight text-brand-700">comarketing</p>
        <p className="mt-0.5 truncate text-sm text-muted" title={user.companyName}>{user.companyName}</p>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-1 px-3">
        {nav.map(({ href, label, Icon, count }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
                active ? "bg-brand-50 text-brand-800" : "text-slate-700 hover:bg-slate-100",
              )}
            >
              <Icon aria-hidden className="size-4.5" />
              {label}
              {count ? (
                <span className="ml-auto rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                  {count}
                  <span className="sr-only"> {label === "Approvals" ? "pending" : "unread"}</span>
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-line px-5 py-4">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="text-xs text-muted">{ROLE_LABEL[user.role]}</p>
        <form action={logoutAction} className="mt-3">
          <button type="submit" className="flex items-center gap-2 text-sm text-muted hover:text-ink">
            <LogOut aria-hidden className="size-4" /> Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <p className="font-semibold text-brand-700">comarketing</p>
        <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="mobile-nav" className="rounded-lg p-2 hover:bg-slate-100">
          <Menu aria-hidden className="size-5" />
          <span className="sr-only">Open navigation</span>
        </button>
      </div>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-line bg-white lg:block">{content}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation" id="mobile-nav">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">
            <button type="button" onClick={() => setOpen(false)} className="absolute top-4 right-3 rounded-lg p-2 hover:bg-slate-100">
              <X aria-hidden className="size-5" />
              <span className="sr-only">Close navigation</span>
            </button>
            {content}
          </div>
        </div>
      )}
    </>
  );
}
