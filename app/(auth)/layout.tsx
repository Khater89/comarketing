import { CalendarCheck2, ShieldCheck, Sparkles } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <section className="hidden flex-col justify-between bg-brand-800 p-12 text-white lg:flex">
        <p className="text-lg font-semibold tracking-tight">comarketing</p>
        <div className="max-w-md space-y-8">
          <h1 className="text-4xl font-semibold leading-tight">Daily social posts, drafted by AI and approved by your team.</h1>
          <ul className="space-y-4 text-brand-100">
            <li className="flex gap-3"><Sparkles aria-hidden className="mt-0.5 size-5 shrink-0" /> Drafts generated every day from your brand voice and campaign themes.</li>
            <li className="flex gap-3"><ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0" /> Nothing is scheduled until an approver signs off, with a full audit trail.</li>
            <li className="flex gap-3"><CalendarCheck2 aria-hidden className="mt-0.5 size-5 shrink-0" /> One calendar for Instagram, X, Facebook and LinkedIn, in your company time zone.</li>
          </ul>
        </div>
        <p className="text-sm text-brand-200">Preview every post per platform before it goes out.</p>
      </section>
      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
