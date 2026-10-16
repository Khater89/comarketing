import { Heart, MessageCircle, Repeat2, Share2, ThumbsUp, ImageIcon } from "lucide-react";
import { PLATFORM_LABEL, PLATFORM_RULES, validateVariant, type Platform } from "@/lib/domain";
import { cn } from "@/lib/utils";

/**
 * Approximate per-platform rendering for review. It is not a pixel copy of any platform's UI and does not
 * guarantee how a provider will display the post (PRD 16 risk: preview mismatch).
 */
export function PlatformPreview({
  platform,
  copy,
  mediaUrl,
  accountName,
  companyName,
}: {
  platform: Platform;
  copy: string;
  mediaUrl?: string | null;
  accountName?: string;
  companyName: string;
}) {
  const handle = accountName || companyName;
  const length = [...copy].length;
  const limit = PLATFORM_RULES[platform].maxChars;
  const issues = validateVariant({ platform, copy, mediaUrl }, "publish");
  const truncated = platform === "instagram" || platform === "linkedin" || platform === "facebook";
  const foldAt = platform === "instagram" ? 125 : platform === "linkedin" ? 210 : 480;

  const media = (
    <div className={cn("flex items-center justify-center bg-slate-100 text-slate-500", platform === "instagram" ? "aspect-square" : "aspect-video rounded-lg")}>
      {mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl} alt="Attached media preview" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="flex items-center gap-1.5 text-xs">
          <ImageIcon aria-hidden className="size-4" /> No media attached
        </span>
      )}
    </div>
  );

  const text = (
    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-900">
      {copy ? (truncated && length > foldAt ? <>{[...copy].slice(0, foldAt).join("")}<span className="text-slate-500">… see more</span></> : copy) : <span className="text-slate-400">Nothing written yet.</span>}
    </p>
  );

  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-white" aria-label={`${PLATFORM_LABEL[platform]} preview`}>
      <div className="flex items-center gap-2.5 px-4 pt-3 pb-2">
        <div aria-hidden className="flex size-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
          {handle.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold">{handle}</p>
          <p className="text-xs text-slate-500">{platform === "x" ? `@${handle.toLowerCase().replace(/\s+/g, "")}` : platform === "linkedin" ? "Company page · now" : "now"}</p>
        </div>
        <span className="ml-auto text-xs font-medium text-slate-500">{PLATFORM_LABEL[platform]}</span>
      </div>
      {platform === "instagram" ? (
        <>
          {media}
          <div className="flex gap-3 px-4 pt-2 text-slate-700" aria-hidden><Heart className="size-5" /><MessageCircle className="size-5" /><Share2 className="size-5" /></div>
          <div className="px-4 pt-1 pb-3">{text}</div>
        </>
      ) : (
        <div className="space-y-3 px-4 pb-3">
          {text}
          {(mediaUrl || platform !== "x") && media}
          <div className="flex gap-5 border-t border-line pt-2 text-xs text-slate-500" aria-hidden>
            {platform === "x" ? (<><MessageCircle className="size-4" /><Repeat2 className="size-4" /><Heart className="size-4" /></>) : (<><ThumbsUp className="size-4" /><MessageCircle className="size-4" /><Share2 className="size-4" /></>)}
          </div>
        </div>
      )}
      <figcaption className={cn("flex flex-wrap justify-between gap-2 border-t border-line px-4 py-2 text-xs", issues.length ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600")}>
        <span>{length.toLocaleString("en-US")} / {limit.toLocaleString("en-US")} characters</span>
        {issues.length ? <span>⚠ {issues.join(" ")}</span> : <span>Ready for {PLATFORM_LABEL[platform]}</span>}
      </figcaption>
    </figure>
  );
}
