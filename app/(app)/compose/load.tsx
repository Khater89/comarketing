import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { aiMode } from "@/lib/server/ai";
import { can, type Platform } from "@/lib/domain";
import { addDays, localDate, localTime } from "@/lib/tz";
import { Composer, type ComposerInitial } from "./composer";

export async function ComposerPage({ id }: { id?: string }) {
  const user = await requireUser();
  const company = await db.company.findUniqueOrThrow({ where: { id: user.companyId } });
  const channels = await db.channelConnection.findMany({ where: { companyId: user.companyId } });
  let initial: ComposerInitial | undefined;
  if (id) {
    const post = await db.post.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        variants: true,
        approvalActions: { where: { comment: { not: null } }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 5 },
      },
    });
    if (!post) notFound();
    initial = {
      id: post.id,
      version: post.version,
      status: post.status,
      source: post.source,
      title: post.title,
      masterCopy: post.masterCopy,
      variants: post.variants.map((v) => ({ platform: v.platform, copy: v.copy, mediaUrl: v.mediaUrl ?? "" })),
      scheduledAt: post.scheduledAt?.toISOString() ?? null,
      failureReason: post.failureReason,
      comments: post.approvalActions.map((a) => ({ id: a.id, actor: a.actor.name, action: a.action, comment: a.comment!, at: a.createdAt.toISOString() })),
    };
  }
  const ref = initial?.scheduledAt ? new Date(initial.scheduledAt) : null;
  const tz = company.timezone;
  return (
    <Composer
      key={initial?.id ?? "new"}
      initial={initial}
      canEdit={can(user.role, "post.edit")}
      canSchedule={can(user.role, "post.schedule")}
      company={{
        name: company.name,
        timezone: tz,
        defaultPlatforms: company.defaultPlatforms as Platform[],
        preferredTimes: company.preferredPublishTimes,
        hasBrandProfile: Boolean(company.brandVoice || company.targetAudience),
      }}
      accounts={Object.fromEntries(channels.map((c) => [c.platform, c.accountName]))}
      aiSimulated={aiMode() === "mock"}
      scheduleDefaults={{
        date: ref ? localDate(ref, tz) : addDays(localDate(new Date(), tz), 1),
        time: ref ? localTime(ref, tz) : (company.preferredPublishTimes[0] ?? "09:00"),
      }}
    />
  );
}
