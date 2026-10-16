import { CircleCheck, CircleDashed, CircleX, Clock, FilePen, Send, TriangleAlert } from "lucide-react";
import { STATUS_LABEL, PLATFORM_LABEL, type PostStatus, type Platform } from "@/lib/domain";
import { Badge } from "./ui";
import { cn } from "@/lib/utils";

const styles: Record<PostStatus, { cls: string; Icon: typeof Clock }> = {
  draft: { cls: "border-slate-300 bg-slate-50 text-slate-700", Icon: FilePen },
  pending_approval: { cls: "border-amber-300 bg-amber-50 text-amber-800", Icon: Clock },
  approved: { cls: "border-sky-300 bg-sky-50 text-sky-800", Icon: CircleCheck },
  rejected: { cls: "border-rose-300 bg-rose-50 text-rose-800", Icon: CircleX },
  scheduled: { cls: "border-brand-200 bg-brand-50 text-brand-800", Icon: Send },
  published: { cls: "border-emerald-300 bg-emerald-50 text-emerald-800", Icon: CircleCheck },
  failed: { cls: "border-red-300 bg-red-50 text-red-800", Icon: TriangleAlert },
};

export function StatusChip({ status, className, simulated }: { status: PostStatus; className?: string; simulated?: boolean }) {
  const { cls, Icon } = styles[status];
  return (
    <Badge className={cn(cls, className)}>
      <Icon aria-hidden className="size-3.5" />
      {STATUS_LABEL[status]}
      {simulated && status === "published" ? " (simulated)" : ""}
    </Badge>
  );
}

const platformDot: Record<Platform, string> = {
  instagram: "bg-pink-600",
  x: "bg-slate-900",
  facebook: "bg-blue-600",
  linkedin: "bg-sky-700",
};

export function PlatformTag({ platform }: { platform: Platform }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
      <span aria-hidden className={cn("size-2 rounded-full", platformDot[platform])} />
      {PLATFORM_LABEL[platform]}
    </span>
  );
}

export function SourceTag({ source }: { source: "manual" | "ai" | "auto" }) {
  if (source === "manual") return null;
  return (
    <Badge className="border-brand-200 bg-white text-brand-700">
      <CircleDashed aria-hidden className="size-3" />
      {source === "auto" ? "AI daily draft" : "AI-assisted"}
    </Badge>
  );
}
