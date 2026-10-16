"use client";

import { useFormStatus } from "react-dom";
import { CircleCheck, Loader2, TriangleAlert } from "lucide-react";
import type { ActionState } from "@/app/actions";
import { buttonClass } from "./ui";
import type { ComponentProps } from "react";

/** Inline status mirror for every critical outcome (not toast-only). */
export function FormStatus({ state }: { state: ActionState | undefined }) {
  if (!state || (state.ok === undefined && !state.error)) return null;
  return (
    <div className="space-y-2">
      {state.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          {state.message}
        </p>
      )}
      {state.warnings?.length ? (
        <ul role="status" className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {state.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { pendingText?: string; variant?: "primary" | "secondary" | "ghost" | "danger" | "success"; size?: "sm" | "md" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || props.disabled} aria-disabled={pending} className={buttonClass(variant, size, className)} {...props}>
      {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}
