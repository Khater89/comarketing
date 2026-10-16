"use client";

import { useActionState, useEffect, useState } from "react";
import { signupAction, type ActionState } from "@/app/actions";
import { Field, Input, Select } from "@/components/ui";
import { FormStatus, SubmitButton } from "@/components/form-status";

export function SignupForm({ zones }: { zones: string[] }) {
  const [state, action] = useActionState<ActionState, FormData>(signupAction, {});
  const [tz, setTz] = useState(state.values?.timezone || "UTC");
  useEffect(() => {
    if (!state.values?.timezone) setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }, [state.values?.timezone]);
  const fe = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const err = (k: string) => ({ "aria-invalid": !!fe[k], "aria-describedby": fe[k] ? `${k}-error` : undefined });
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Company name" htmlFor="companyName" required error={fe.companyName}>
        <Input id="companyName" name="companyName" required defaultValue={v.companyName} autoComplete="organization" {...err("companyName")} />
      </Field>
      <Field label="Your name" htmlFor="name" required error={fe.name}>
        <Input id="name" name="name" required defaultValue={v.name} autoComplete="name" {...err("name")} />
      </Field>
      <Field label="Work email" htmlFor="email" required error={fe.email}>
        <Input id="email" name="email" type="email" required defaultValue={v.email} autoComplete="email" {...err("email")} />
      </Field>
      <Field label="Password" htmlFor="password" required error={fe.password} hint="At least 10 characters.">
        <Input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" {...err("password")} />
      </Field>
      <Field label="Company time zone" htmlFor="timezone" required error={fe.timezone} hint="All schedules are shown and entered in this time zone.">
        <Select id="timezone" name="timezone" value={tz} onChange={(e) => setTz(e.target.value)} {...err("timezone")}>
          {zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </Select>
      </Field>
      <FormStatus state={state} />
      <SubmitButton className="w-full" pendingText="Creating workspace…">Create workspace</SubmitButton>
    </form>
  );
}
