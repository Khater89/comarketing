"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export function DrawerShell({ closeHref, title, children }: { closeHref: string; title: string; children: React.ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && router.push(closeHref, { scroll: false });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [closeHref, router]);
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <Link href={closeHref} scroll={false} aria-label="Close details" className="absolute inset-0 bg-slate-900/30" />
      <div ref={ref} tabIndex={-1} className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl outline-none">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="drawer-title" className="text-lg font-semibold">{title}</h2>
          <Link href={closeHref} scroll={false} className="rounded-lg p-1.5 hover:bg-slate-100"><X aria-hidden className="size-5" /><span className="sr-only">Close</span></Link>
        </div>
        {children}
      </div>
    </div>
  );
}
