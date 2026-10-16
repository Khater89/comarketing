import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  secondary: "bg-white text-ink border border-line hover:bg-slate-50 shadow-sm",
  ghost: "text-muted hover:bg-slate-100 hover:text-ink",
  danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
  success: "bg-emerald-700 text-white hover:bg-emerald-800 shadow-sm",
};

export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap",
    size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
    buttonStyles[variant],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-xl border border-line bg-white shadow-sm", className)} {...props} />;
}

export function CardHeader({ title, description, action, id }: { title: string; description?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 id={id} className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </header>
  );
}

const fieldBase =
  "block w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-slate-400 shadow-xs transition-colors focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 aria-[invalid=true]:border-red-500";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldBase, "h-10 pr-8", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
        {required ? <span className="text-red-700"> *</span> : <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children}
      {hint && !error && <p id={`${htmlFor}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Badge({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", className)} {...props} />;
}
