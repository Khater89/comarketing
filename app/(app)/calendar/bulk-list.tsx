"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { bulkShiftAction, type ActionState } from "@/app/actions";
import { PLATFORM_LABEL } from "@/lib/domain";
import { formatShortDate } from "@/lib/tz";
import { Card, Input } from "@/components/ui";
import { StatusChip } from "@/components/status";
import { FormStatus, SubmitButton } from "@/components/form-status";
import type { CalItem } from "./grid";

export function BulkList({ items, canSchedule, baseHref }: { items: CalItem[]; canSchedule: boolean; baseHref: string }) {
  const [state, action] = useActionState<ActionState, FormData>(bulkShiftAction, {});
  const [checked, setChecked] = useState<string[]>([]);
  const schedulable = items.filter((i) => i.status === "scheduled");
  const toggle = (id: string) => setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  return (
    <form action={action}>
      {canSchedule && schedulable.length > 0 && (
        <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white p-4 shadow-sm">
          <p className="text-sm text-muted"><strong className="text-ink">{checked.length}</strong> scheduled post(s) selected</p>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Move by days</span>
            <Input name="days" type="number" min={-365} max={365} step={1} defaultValue={state.values?.days ?? "1"} className="w-28" required />
          </label>
          <SubmitButton variant="secondary" disabled={!checked.length} pendingText="Moving…">Bulk reschedule</SubmitButton>
          <div className="w-full"><FormStatus state={state} /></div>
        </div>
      )}
      <Card>
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id} className="flex items-start gap-3 px-4 py-3">
              {canSchedule && (
                <input
                  type="checkbox"
                  name="postIds"
                  value={i.id}
                  checked={checked.includes(i.id)}
                  onChange={() => toggle(i.id)}
                  disabled={i.status !== "scheduled"}
                  aria-label={`Select ${i.title}`}
                  className="mt-1 accent-brand-600 disabled:opacity-30"
                />
              )}
              <div className="min-w-0 flex-1">
                <Link href={`${baseHref}${baseHref.includes("?") ? "&" : "?"}post=${i.id}`} scroll={false} className="font-medium hover:text-brand-700 hover:underline">{i.title}</Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <StatusChip status={i.status} />
                  <span>{i.date ? `${formatShortDate(i.date)} ${i.time}${i.suggested ? " (suggested)" : ""}` : "No date"}</span>
                  <span>{i.platforms.map((p) => PLATFORM_LABEL[p]).join(", ")}</span>
                  <span>by {i.author}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </form>
  );
}
