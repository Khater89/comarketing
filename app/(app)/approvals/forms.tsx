"use client";

import { useActionState, useState } from "react";
import { commentAction, decisionAction, type ActionState } from "@/app/actions";
import { Field, Textarea } from "@/components/ui";
import { FormStatus, SubmitButton } from "@/components/form-status";

export function DecisionForm({ postId, version, commands }: { postId: string; version: number; commands: ("approve" | "reject" | "request_changes")[] }) {
  const [state, action] = useActionState<ActionState, FormData>(decisionAction, {});
  const [comment, setComment] = useState(state.values?.comment ?? "");
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="version" value={version} />
      <Field label="Comment" htmlFor={`decision-comment-${postId}`} error={fe.comment} hint="Required when requesting changes.">
        <Textarea id={`decision-comment-${postId}`} name="comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} aria-invalid={!!fe.comment} />
      </Field>
      <FormStatus state={state} />
      <div className="flex flex-wrap gap-2">
        {commands.includes("approve") && <SubmitButton name="command" value="approve" variant="success" pendingText="Saving…">Approve</SubmitButton>}
        {commands.includes("request_changes") && <SubmitButton name="command" value="request_changes" variant="secondary" pendingText="Saving…">Request changes</SubmitButton>}
        {commands.includes("reject") && <SubmitButton name="command" value="reject" variant="danger" pendingText="Saving…">Reject</SubmitButton>}
      </div>
    </form>
  );
}

export function CommentForm({ postId }: { postId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(commentAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-3" noValidate key={state.ok ? state.message : "form"}>
      <input type="hidden" name="postId" value={postId} />
      <Field label="Add a comment" htmlFor={`comment-${postId}`} required error={fe.comment}>
        <Textarea id={`comment-${postId}`} name="comment" rows={2} maxLength={2000} defaultValue={state.ok ? "" : state.values?.comment} aria-invalid={!!fe.comment} />
      </Field>
      <FormStatus state={state} />
      <SubmitButton variant="secondary" size="sm" pendingText="Posting…">Post comment</SubmitButton>
    </form>
  );
}
