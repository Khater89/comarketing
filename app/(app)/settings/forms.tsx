"use client";

import { useActionState } from "react";
import type { Company } from "@prisma/client";
import {
  channelAction,
  createUserAction,
  runGenerationNowAction,
  updateCompanyAction,
  updatePostingAction,
  updateUserAction,
  type ActionState,
} from "@/app/actions";
import { PLATFORMS, PLATFORM_LABEL, ROLES, ROLE_LABEL, type Platform, type Role } from "@/lib/domain";
import { Card, Field, Input, Select, Textarea } from "@/components/ui";
import { FormStatus, SubmitButton } from "@/components/form-status";
import { cn } from "@/lib/utils";

function useForm(fn: (s: ActionState, fd: FormData) => Promise<ActionState>) {
  return useActionState<ActionState, FormData>(fn, {});
}

const inv = (fe: Record<string, string>, k: string) => ({ "aria-invalid": !!fe[k], "aria-describedby": fe[k] ? `${k}-error` : undefined });

export function CompanyForm({ company, zones, disabled }: { company: Company; zones: string[]; disabled: boolean }) {
  const [state, action] = useForm(updateCompanyAction);
  const fe = state.fieldErrors ?? {};
  const v = (k: keyof Company) => state.values?.[k] ?? String(company[k] ?? "");
  return (
    <form action={action} className="space-y-4" noValidate>
      <fieldset disabled={disabled} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" htmlFor="name" required error={fe.name}><Input id="name" name="name" defaultValue={v("name")} {...inv(fe, "name")} /></Field>
          <Field label="Industry" htmlFor="industry" error={fe.industry}><Input id="industry" name="industry" defaultValue={v("industry")} /></Field>
        </div>
        <Field label="Time zone" htmlFor="timezone" required error={fe.timezone} hint="Changing it does not move already-scheduled posts; their UTC instant stays the same.">
          <Select id="timezone" name="timezone" defaultValue={v("timezone")}>{zones.map((z) => <option key={z}>{z}</option>)}</Select>
        </Field>
        <Field label="Brand voice" htmlFor="brandVoice" hint="Tone, personality, style. e.g. Warm, expert, concise; avoid slang."><Textarea id="brandVoice" name="brandVoice" rows={3} defaultValue={v("brandVoice")} /></Field>
        <Field label="Target audience" htmlFor="targetAudience"><Textarea id="targetAudience" name="targetAudience" rows={2} defaultValue={v("targetAudience")} /></Field>
        <Field label="Campaign themes" htmlFor="campaignGoals" hint="One theme per line. Daily AI drafts rotate through these."><Textarea id="campaignGoals" name="campaignGoals" rows={4} defaultValue={v("campaignGoals")} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prohibited words" htmlFor="prohibitedWords" hint="Comma-separated. Drafts containing them are flagged."><Input id="prohibitedWords" name="prohibitedWords" defaultValue={v("prohibitedWords")} /></Field>
          <Field label="Preferred hashtags" htmlFor="hashtags"><Input id="hashtags" name="hashtags" defaultValue={v("hashtags")} placeholder="#brand #campaign" /></Field>
        </div>
      </fieldset>
      <FormStatus state={state} />
      {!disabled && <SubmitButton pendingText="Saving…">Save profile</SubmitButton>}
    </form>
  );
}

export function PostingForm({ company, disabled }: { company: Company; disabled: boolean }) {
  const [state, action] = useForm(updatePostingAction);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <fieldset disabled={disabled} className="space-y-4">
        <Field label="Posts per day" htmlFor="postingCadence" required error={fe.postingCadence} hint="1–10. Used by daily AI drafts.">
          <Input id="postingCadence" name="postingCadence" type="number" min={1} max={10} defaultValue={state.values?.postingCadence ?? company.postingCadence} className="w-28" {...inv(fe, "postingCadence")} />
        </Field>
        <Field label="Preferred publish times" htmlFor="preferredPublishTimes" required error={fe.preferredPublishTimes} hint="24-hour HH:mm, comma-separated, e.g. 09:00, 17:30">
          <Input id="preferredPublishTimes" name="preferredPublishTimes" defaultValue={state.values?.preferredPublishTimes ?? company.preferredPublishTimes.join(", ")} {...inv(fe, "preferredPublishTimes")} />
        </Field>
        <fieldset>
          <legend className="text-sm font-medium">Default platforms <span className="text-red-700">*</span></legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <label key={p} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <input type="checkbox" name="defaultPlatforms" value={p} defaultChecked={company.defaultPlatforms.includes(p)} className="accent-brand-600" /> {PLATFORM_LABEL[p]}
              </label>
            ))}
          </div>
          {fe.defaultPlatforms && <p className="mt-1 text-xs font-medium text-red-700">{fe.defaultPlatforms}</p>}
        </fieldset>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="autoGenerateEnabled" defaultChecked={company.autoGenerateEnabled} className="mt-1 accent-brand-600" />
          <span><span className="font-medium">Generate daily AI drafts automatically</span><br /><span className="text-muted">Requires the background worker to be running.</span></span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="autoSubmitForApproval" defaultChecked={company.autoSubmitForApproval} className="mt-1 accent-brand-600" />
          <span><span className="font-medium">Send generated drafts straight to the approval inbox</span><br /><span className="text-muted">Otherwise they stay as drafts for creators to refine.</span></span>
        </label>
      </fieldset>
      <FormStatus state={state} />
      {!disabled && <SubmitButton pendingText="Saving…">Save defaults</SubmitButton>}
    </form>
  );
}

export function GenerateNowForm() {
  const [state, action] = useForm(runGenerationNowAction);
  return (
    <form action={action} className="space-y-2">
      <FormStatus state={state} />
      <SubmitButton variant="secondary" pendingText="Generating drafts…">Generate tomorrow’s drafts now</SubmitButton>
      <p className="text-xs text-muted">Uses your cadence, themes and default platforms. Drafts still need approval.</p>
    </form>
  );
}

export function ChannelCard({
  channel,
  disabled,
  simulateAvailable,
}: {
  channel: { platform: Platform; accountName: string; status: string; simulated: boolean; scopes: string[]; lastSync: string | null; lastError: string | null };
  disabled: boolean;
  simulateAvailable: boolean;
}) {
  const [state, action] = useForm(channelAction);
  const connected = channel.status === "connected";
  return (
    <Card>
      <form action={action} className="space-y-3 p-5">
        <input type="hidden" name="platform" value={channel.platform} />
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">{PLATFORM_LABEL[channel.platform]}</h2>
          <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", connected ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-slate-50 text-slate-700")}>
            {connected ? (channel.simulated ? "Connected (simulated)" : "Connected") : channel.status === "expired" ? "Token expired" : channel.status === "error" ? "Error" : "Not connected"}
          </span>
        </div>
        <p className="text-xs text-muted">
          {channel.lastSync ? `Last checked ${channel.lastSync}` : "Never connected"}
          {channel.scopes.length > 0 && ` · permissions: ${channel.scopes.join(", ")}`}
        </p>
        {channel.lastError && <p className="text-xs text-red-700">{channel.lastError}</p>}
        <Field label="Account / page name" htmlFor={`acct-${channel.platform}`} hint="Shown in previews.">
          <Input id={`acct-${channel.platform}`} name="accountName" defaultValue={channel.accountName} disabled={disabled} />
        </Field>
        <FormStatus state={state} />
        {!disabled && (
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="intent" value="save" variant="secondary" size="sm">Save name</SubmitButton>
            {!connected && simulateAvailable && <SubmitButton name="intent" value="simulate" size="sm">Connect (simulated)</SubmitButton>}
            {connected && <SubmitButton name="intent" value="disconnect" variant="danger" size="sm">Disconnect</SubmitButton>}
          </div>
        )}
      </form>
    </Card>
  );
}

export function UserRow({ user, canManage, isSelf }: { user: { id: string; name: string; email: string; role: Role; status: string; lastLogin: string }; canManage: boolean; isSelf: boolean }) {
  const [state, action] = useForm(updateUserAction);
  const formId = `user-${user.id}`;
  return (
    <tr>
      <td className="px-5 py-3"><p className="font-medium">{user.name}{isSelf && <span className="text-muted"> (you)</span>}</p><p className="text-xs text-muted">{user.email}</p></td>
      <td className="px-3 py-3">
        {canManage ? (
          <Select form={formId} name="role" defaultValue={user.role} aria-label={`Role for ${user.name}`} className="h-9 w-44">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>
        ) : ROLE_LABEL[user.role]}
      </td>
      <td className="px-3 py-3">
        {canManage ? (
          <Select form={formId} name="status" defaultValue={user.status} aria-label={`Status for ${user.name}`} className="h-9 w-32"><option value="active">Active</option><option value="disabled">Disabled</option></Select>
        ) : user.status}
      </td>
      <td className="px-3 py-3 text-xs text-muted">{user.lastLogin}</td>
      <td className="px-5 py-3">
        {canManage && (
          <form id={formId} action={action} className="space-y-1">
            <input type="hidden" name="userId" value={user.id} />
            <SubmitButton variant="secondary" size="sm" pendingText="Saving…">Save</SubmitButton>
            {state.error && <p role="alert" className="text-xs text-red-700">{state.error}</p>}
            {state.message && <p role="status" className="text-xs text-emerald-800">Saved</p>}
          </form>
        )}
      </td>
    </tr>
  );
}

export function CreateUserForm() {
  const [state, action] = useForm(createUserAction);
  const fe = state.fieldErrors ?? {};
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form action={action} className="space-y-4" noValidate key={state.ok ? state.message : "new-user"}>
      <Field label="Name" htmlFor="nu-name" required error={fe.name}><Input id="nu-name" name="name" defaultValue={v.name} aria-invalid={!!fe.name} /></Field>
      <Field label="Email" htmlFor="nu-email" required error={fe.email}><Input id="nu-email" name="email" type="email" defaultValue={v.email} aria-invalid={!!fe.email} /></Field>
      <Field label="Role" htmlFor="nu-role" required error={fe.role}>
        <Select id="nu-role" name="role" defaultValue={v.role ?? "creator"}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>
      </Field>
      <Field label="Temporary password" htmlFor="nu-password" required error={fe.password} hint="At least 10 characters."><Input id="nu-password" name="password" type="password" autoComplete="new-password" aria-invalid={!!fe.password} /></Field>
      <FormStatus state={state} />
      <SubmitButton pendingText="Adding…">Add user</SubmitButton>
    </form>
  );
}
