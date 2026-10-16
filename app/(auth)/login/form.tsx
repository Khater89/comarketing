"use client";

import { useActionState } from "react";
import { loginAction, type ActionState } from "@/app/actions";
import { Field, Input } from "@/components/ui";
import { FormStatus, SubmitButton } from "@/components/form-status";

export function LoginForm() {
  const [state, action] = useActionState<ActionState, FormData>(loginAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Work email" htmlFor="email" required error={fe.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} aria-invalid={!!fe.email} aria-describedby={fe.email ? "email-error" : undefined} />
      </Field>
      <Field label="Password" htmlFor="password" required error={fe.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={!!fe.password} aria-describedby={fe.password ? "password-error" : undefined} />
      </Field>
      <FormStatus state={state} />
      <SubmitButton className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
