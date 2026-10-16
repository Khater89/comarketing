"use client";

import { useActionState } from "react";
import { scheduleAction, decisionAction, type ActionState } from "@/app/actions";
import { Field, Input } from "./ui";
import { FormStatus, SubmitButton } from "./form-status";

export function ScheduleForm({
  postId,
  version,
  timeZone,
  defaultDate,
  defaultTime,
  preferredTimes,
  isScheduled,
}: {
  postId: string;
  version: number;
  timeZone: string;
  defaultDate: string;
  defaultTime: string;
  preferredTimes: string[];
  isScheduled: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(scheduleAction, {});
  const [unState, unAction] = useActionState<ActionState, FormData>(decisionAction, {});
  const fe = state.fieldErrors ?? {};
  const listId = `times-${postId}`;
  return (
    <div className="space-y-3">
      <form action={action} className="space-y-3" noValidate>
        <input type="hidden" name="postId" value={postId} />
        <input type="hidden" name="version" value={version} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor={`date-${postId}`} required>
            <Input id={`date-${postId}`} name="date" type="date" required defaultValue={state.values?.date ?? defaultDate} aria-invalid={!!fe.when} aria-describedby={fe.when ? `when-${postId}-error` : undefined} />
          </Field>
          <Field label="Time (24h)" htmlFor={`time-${postId}`} required>
            <Input id={`time-${postId}`} name="time" type="time" required list={listId} defaultValue={state.values?.time ?? defaultTime} aria-invalid={!!fe.when} />
          </Field>
        </div>
        <datalist id={listId}>{preferredTimes.map((t) => <option key={t} value={t} />)}</datalist>
        <p className="text-xs text-muted">Time zone: <strong className="font-medium text-ink">{timeZone}</strong> (company setting).</p>
        {fe.when && <p id={`when-${postId}-error`} className="text-xs font-medium text-red-700">{fe.when}</p>}
        <FormStatus state={state} />
        <SubmitButton pendingText="Scheduling…" className="w-full">{isScheduled ? "Reschedule" : "Schedule post"}</SubmitButton>
      </form>
      {isScheduled && (
        <form action={unAction} className="space-y-2">
          <input type="hidden" name="postId" value={postId} />
          <input type="hidden" name="version" value={version} />
          <input type="hidden" name="command" value="unschedule" />
          <FormStatus state={unState} />
          <SubmitButton variant="ghost" size="sm" pendingText="Unscheduling…" className="w-full">Unschedule (keep approved)</SubmitButton>
        </form>
      )}
    </div>
  );
}
