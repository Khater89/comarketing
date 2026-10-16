"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Copy, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { generateDraftAction, savePostAction, type ActionState } from "@/app/actions";
import { PLATFORMS, PLATFORM_LABEL, PLATFORM_RULES, validateVariant, type Platform, type PostStatus } from "@/lib/domain";
import { formatDateTime } from "@/lib/tz";
import { Button, Card, CardHeader, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { FormStatus } from "@/components/form-status";
import { SourceTag, StatusChip } from "@/components/status";
import { PlatformPreview } from "@/components/platform-preview";
import { ScheduleForm } from "@/components/schedule-form";
import { cn } from "@/lib/utils";

export type ComposerInitial = {
  id: string;
  version: number;
  status: PostStatus;
  source: "manual" | "ai" | "auto";
  title: string;
  masterCopy: string;
  variants: { platform: Platform; copy: string; mediaUrl: string }[];
  scheduledAt: string | null;
  failureReason: string | null;
  comments: { id: string; actor: string; action: string; comment: string; at: string }[];
};

type VariantState = Record<Platform, { copy: string; mediaUrl: string }>;

export function Composer({
  initial,
  canEdit,
  canSchedule,
  company,
  accounts,
  aiSimulated,
  scheduleDefaults,
}: {
  initial?: ComposerInitial;
  canEdit: boolean;
  canSchedule: boolean;
  company: { name: string; timezone: string; defaultPlatforms: Platform[]; preferredTimes: string[]; hasBrandProfile: boolean };
  accounts: Partial<Record<Platform, string>>;
  aiSimulated: boolean;
  scheduleDefaults: { date: string; time: string };
}) {
  const router = useRouter();
  const blankVariants = () =>
    Object.fromEntries(PLATFORMS.map((p) => [p, { copy: "", mediaUrl: "" }])) as VariantState;

  const startVariants = useMemo(() => {
    const v = blankVariants();
    initial?.variants.forEach((x) => (v[x.platform] = { copy: x.copy, mediaUrl: x.mediaUrl }));
    return v;
  }, [initial]);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [masterCopy, setMasterCopy] = useState(initial?.masterCopy ?? "");
  const [selected, setSelected] = useState<Platform[]>(
    initial?.variants.map((v) => v.platform) ?? (company.defaultPlatforms.length ? company.defaultPlatforms : ["linkedin"]),
  );
  const [variants, setVariants] = useState<VariantState>(startVariants);
  const [tab, setTab] = useState<Platform>(selected[0] ?? "linkedin");
  const [prompt, setPrompt] = useState("");
  const [source, setSource] = useState<"manual" | "ai">(initial?.source === "manual" ? "manual" : initial ? "ai" : "manual");
  const [aiState, setAiState] = useState<{ error?: string; info?: string; warnings?: string[] }>({});
  const [saveState, setSaveState] = useState<ActionState>({});
  const [generating, startGenerate] = useTransition();
  const [saving, startSave] = useTransition();
  const [savingKind, setSavingKind] = useState<"draft" | "submit" | null>(null);

  const readOnly = !canEdit || initial?.status === "published";
  const sortedSelected = PLATFORMS.filter((p) => selected.includes(p));

  const dirty = useMemo(() => {
    if (!initial) return Boolean(title || masterCopy || PLATFORMS.some((p) => variants[p].copy));
    const cur = JSON.stringify({ title, masterCopy, v: sortedSelected.map((p) => [p, variants[p].copy, variants[p].mediaUrl]) });
    const orig = JSON.stringify({
      title: initial.title,
      masterCopy: initial.masterCopy,
      v: PLATFORMS.filter((p) => initial.variants.some((x) => x.platform === p)).map((p) => [p, startVariants[p].copy, startVariants[p].mediaUrl]),
    });
    return cur !== orig;
  }, [initial, title, masterCopy, variants, sortedSelected, startVariants]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    if (!selected.includes(tab) && selected[0]) setTab(selected[0]);
  }, [selected, tab]);

  const togglePlatform = (p: Platform) =>
    setSelected((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));

  const setVariant = (p: Platform, patch: Partial<{ copy: string; mediaUrl: string }>) =>
    setVariants((v) => ({ ...v, [p]: { ...v[p], ...patch } }));

  const generate = () => {
    setAiState({});
    startGenerate(async () => {
      const r = await generateDraftAction({ prompt, platforms: sortedSelected, postId: initial?.id });
      if (!r.ok) {
        setAiState({ error: r.error });
        return;
      }
      if (!title) setTitle(r.title);
      setMasterCopy(r.masterCopy);
      setVariants((v) => {
        const next = { ...v };
        for (const p of sortedSelected) if (r.variants[p] !== undefined) next[p] = { ...next[p], copy: r.variants[p]! };
        return next;
      });
      setSource("ai");
      setAiState({
        info: `Draft generated by ${r.modelRef}${r.simulated ? " — simulated output for development, not a real AI response" : ""}. Review and edit before submitting. Nothing has been saved yet.`,
        warnings: r.warnings,
      });
    });
  };

  const save = (submit: boolean) => {
    setSavingKind(submit ? "submit" : "draft");
    startSave(async () => {
      const r = await savePostAction(
        {
          id: initial?.id,
          version: initial?.version,
          title,
          masterCopy,
          source,
          variants: sortedSelected.map((p) => ({ platform: p, copy: variants[p].copy, mediaUrl: variants[p].mediaUrl || null })),
        },
        submit,
      );
      setSaveState(r);
      setSavingKind(null);
      if (r.ok && r.postId) {
        if (!initial) router.replace(`/compose/${r.postId}?saved=1`);
        else router.refresh();
      }
    });
  };

  const fe = saveState.fieldErrors ?? {};
  const submitBlocked = sortedSelected.some((p) => validateVariant({ platform: p, ...variants[p] }, "draft").length > 0);
  const canSubmit = !initial || ["draft", "rejected"].includes(initial.status) || dirty;
  const showSchedule = initial && canSchedule && !dirty && ["approved", "scheduled", "failed"].includes(initial.status);

  return (
    <>
      <PageHeader
        title={initial ? "Edit post" : "New post"}
        description={
          initial ? (
            <span className="flex flex-wrap items-center gap-2">
              <StatusChip status={initial.status} />
              <SourceTag source={initial.source} />
              {initial.scheduledAt && <span>Scheduled {formatDateTime(new Date(initial.scheduledAt), company.timezone)}</span>}
            </span>
          ) : (
            "Generate a draft with AI or write your own, tailor it per platform, then send it for approval."
          )
        }
        action={initial && <Link href={`/approvals?post=${initial.id}`} className="text-sm font-medium text-brand-700 hover:underline">View review &amp; history</Link>}
      />

      {initial && ["approved", "scheduled"].includes(initial.status) && canEdit && (
        <p role="note" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This post is {initial.status}. Saving any content change returns it to draft{initial.status === "scheduled" ? ", removes it from the schedule," : ""} and it must be approved again.
        </p>
      )}
      {initial?.status === "failed" && initial.failureReason && (
        <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Last publish attempt failed: {initial.failureReason}
        </p>
      )}

      <div className="grid gap-6 grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {!readOnly && (
            <Card>
              <CardHeader
                title="AI draft"
                description={company.hasBrandProfile ? "Uses your saved brand voice, audience, themes and prohibited words." : <>Add your brand voice in <Link className="text-brand-700 underline" href="/settings?tab=company">settings</Link> for better drafts.</>}
              />
              <div className="space-y-3 p-5">
                <Field label="What should the post be about?" htmlFor="prompt" hint="e.g. Announce our Ramadan opening hours; friendly tone; invite people to visit." required>
                  <Textarea id="prompt" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={4000} />
                </Field>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" onClick={generate} disabled={generating || !sortedSelected.length || prompt.trim().length < 5}>
                    {generating ? <Loader2 aria-hidden className="size-4 animate-spin" /> : source === "ai" ? <RefreshCw aria-hidden className="size-4" /> : <Sparkles aria-hidden className="size-4" />}
                    {generating ? "Generating…" : source === "ai" ? "Regenerate" : "Generate draft"}
                  </Button>
                  {aiSimulated && <span className="text-xs text-amber-800">AI is in simulated development mode.</span>}
                </div>
                <div aria-live="polite" className="space-y-2">
                  {aiState.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{aiState.error}</p>}
                  {aiState.info && <p className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">{aiState.info}</p>}
                  {aiState.warnings?.map((w) => <p key={w} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{w}</p>)}
                </div>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Content" />
            <div className="space-y-4 p-5">
              <Field label="Internal title" htmlFor="title" required error={fe.title}>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} disabled={readOnly} aria-invalid={!!fe.title} aria-describedby={fe.title ? "title-error" : undefined} />
              </Field>
              <Field label="Core message" htmlFor="masterCopy" error={fe.masterCopy} hint="The platform-neutral message. Copy it into each platform tab, then adapt.">
                <Textarea id="masterCopy" rows={3} value={masterCopy} onChange={(e) => setMasterCopy(e.target.value)} disabled={readOnly} />
              </Field>

              <fieldset>
                <legend className="text-sm font-medium">Platforms <span className="text-red-700">*</span></legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PLATFORMS.map((p) => (
                    <label key={p} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", selected.includes(p) ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line bg-white")}>
                      <input type="checkbox" className="accent-brand-600" checked={selected.includes(p)} onChange={() => togglePlatform(p)} disabled={readOnly} />
                      {PLATFORM_LABEL[p]}
                    </label>
                  ))}
                </div>
                {(fe.variants || !selected.length) && <p className="mt-1 text-xs font-medium text-red-700">{fe.variants ?? "Choose at least one platform."}</p>}
              </fieldset>

              {sortedSelected.length > 0 && (
                <div>
                  <div role="tablist" aria-label="Platform variants" className="flex gap-1 overflow-x-auto border-b border-line">
                    {sortedSelected.map((p) => {
                      const errs = validateVariant({ platform: p, ...variants[p] }, "draft");
                      return (
                        <button
                          key={p}
                          role="tab"
                          id={`tab-${p}`}
                          type="button"
                          aria-selected={tab === p}
                          aria-controls={`panel-${p}`}
                          tabIndex={tab === p ? 0 : -1}
                          onClick={() => setTab(p)}
                          onKeyDown={(e) => {
                            const i = sortedSelected.indexOf(p);
                            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                              const next = sortedSelected[(i + (e.key === "ArrowRight" ? 1 : -1) + sortedSelected.length) % sortedSelected.length];
                              setTab(next);
                              document.getElementById(`tab-${next}`)?.focus();
                            }
                          }}
                          className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap", tab === p ? "border-brand-600 text-brand-800" : "border-transparent text-muted hover:text-ink")}
                        >
                          {PLATFORM_LABEL[p]}
                          {(errs.length > 0 || fe[`variant.${p}`]) && <span className="ml-1 text-red-700" aria-label="has errors">●</span>}
                        </button>
                      );
                    })}
                  </div>
                  {sortedSelected.map((p) => {
                    const len = [...variants[p].copy].length;
                    const max = PLATFORM_RULES[p].maxChars;
                    const err = fe[`variant.${p}`] ?? validateVariant({ platform: p, ...variants[p] }, "draft").join(" ");
                    return (
                      <div key={p} role="tabpanel" id={`panel-${p}`} aria-labelledby={`tab-${p}`} hidden={tab !== p} className="space-y-3 pt-4">
                        <Field label={`${PLATFORM_LABEL[p]} copy`} htmlFor={`copy-${p}`} required error={err || undefined} hint={<span className={len > max ? "text-red-700" : undefined}>{len.toLocaleString("en-US")} / {max.toLocaleString("en-US")} characters</span>}>
                          <Textarea id={`copy-${p}`} rows={7} value={variants[p].copy} onChange={(e) => setVariant(p, { copy: e.target.value })} disabled={readOnly} aria-invalid={!!err} />
                        </Field>
                        {!readOnly && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => setVariant(p, { copy: masterCopy })} disabled={!masterCopy}>
                            <Copy aria-hidden className="size-4" /> Use core message
                          </Button>
                        )}
                        <Field label="Media URL" htmlFor={`media-${p}`} hint={PLATFORM_RULES[p].requiresMedia ? "Required by Instagram before scheduling. Use a public https image or video URL." : "Public https image or video URL."}>
                          <Input id={`media-${p}`} type="url" inputMode="url" placeholder="https://…" value={variants[p].mediaUrl} onChange={(e) => setVariant(p, { mediaUrl: e.target.value })} disabled={readOnly} />
                        </Field>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          {initial && initial.comments.length > 0 && (
            <Card>
              <CardHeader title="Reviewer feedback" />
              <ul className="divide-y divide-line">
                {initial.comments.map((c) => (
                  <li key={c.id} className="px-5 py-3 text-sm">
                    <p className="text-xs text-muted">{c.actor} · {c.action.replace("_", " ")} · {formatDateTime(new Date(c.at), company.timezone)}</p>
                    <p className="mt-1 whitespace-pre-wrap">{c.comment}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Preview" description="Approximate rendering per platform. Final display depends on each network." />
            <div className="space-y-4 p-5">
              {sortedSelected.length === 0 ? (
                <p className="text-sm text-muted">Choose a platform to see a preview.</p>
              ) : (
                sortedSelected.map((p) => (
                  <PlatformPreview key={p} platform={p} copy={variants[p].copy} mediaUrl={variants[p].mediaUrl || null} accountName={accounts[p]} companyName={company.name} />
                ))
              )}
            </div>
          </Card>

          {showSchedule && (
            <Card>
              <CardHeader title={initial!.status === "scheduled" ? "Schedule" : "Schedule approved post"} />
              <div className="p-5">
                <ScheduleForm
                  postId={initial!.id}
                  version={initial!.version}
                  timeZone={company.timezone}
                  defaultDate={scheduleDefaults.date}
                  defaultTime={scheduleDefaults.time}
                  preferredTimes={company.preferredTimes}
                  isScheduled={initial!.status === "scheduled"}
                />
              </div>
            </Card>
          )}
        </div>
      </div>

      {!readOnly && (
        <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1" aria-live="polite">
              <FormStatus state={saveState} />
              {!saveState.error && !saveState.message && <p className="text-sm text-muted">{dirty ? "Unsaved changes" : initial ? "All changes saved" : "Not saved yet"}</p>}
            </div>
            <Button type="button" variant="secondary" onClick={() => save(false)} disabled={saving || !dirty || !title.trim() || !selected.length || submitBlocked}>
              {saving && savingKind === "draft" && <Loader2 aria-hidden className="size-4 animate-spin" />}
              Save draft
            </Button>
            <Button type="button" onClick={() => save(true)} disabled={saving || !canSubmit || !title.trim() || !selected.length || submitBlocked}>
              {saving && savingKind === "submit" && <Loader2 aria-hidden className="size-4 animate-spin" />}
              Save &amp; request approval
            </Button>
          </div>
          {saveState.conflict && (
            <p className="mt-2 text-sm">
              <button type="button" className="font-medium text-brand-700 underline" onClick={() => window.location.reload()}>Reload latest version</button> (your unsaved text will be lost — copy it first).
            </p>
          )}
        </div>
      )}
    </>
  );
}
