import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { aiMode } from "@/lib/server/ai";
import { publisherMode } from "@/lib/server/publisher";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [unread, pending] = await Promise.all([
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.post.count({ where: { companyId: user.companyId, status: "pending_approval" } }),
  ]);
  const devModes = [aiMode() === "mock" && "AI output is simulated", publisherMode() === "simulate" && "publishing is simulated"].filter(Boolean);
  return (
    <div className="min-h-dvh lg:pl-64">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow">Skip to content</a>
      <Sidebar user={{ name: user.name, role: user.role, companyName: user.company.name }} unread={unread} pending={pending} />
      {devModes.length > 0 && (
        <p role="note" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900">
          Development mode: {devModes.join(" and ")}. Nothing is sent to real social networks.
        </p>
      )}
      <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
