import type { Prisma, Role } from "@prisma/client";
import { db } from "./db";

type Tx = Prisma.TransactionClient | typeof db;

export type Actor = { id: string; name: string } | "system";

export async function logActivity(
  tx: Tx,
  input: {
    companyId: string;
    actor: Actor;
    entityType: string;
    entityId: string;
    action: string;
    outcome?: "success" | "failure";
    detail?: string;
  },
) {
  await tx.activityLog.create({
    data: {
      companyId: input.companyId,
      actorUserId: input.actor === "system" ? null : input.actor.id,
      actorName: input.actor === "system" ? "System" : input.actor.name,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      outcome: input.outcome ?? "success",
      detail: input.detail?.slice(0, 1000),
    },
  });
}

/** In-app notifications only. No email/push delivery is implemented, so none is claimed. */
export async function notify(
  tx: Tx,
  input: {
    companyId: string;
    type: string;
    message: string;
    postId?: string;
    userIds?: string[];
    roles?: Role[];
    excludeUserId?: string;
  },
) {
  const ids = new Set(input.userIds ?? []);
  if (input.roles?.length) {
    const users = await tx.user.findMany({
      where: { companyId: input.companyId, role: { in: input.roles }, status: "active" },
      select: { id: true },
    });
    users.forEach((u) => ids.add(u.id));
  }
  if (input.excludeUserId) ids.delete(input.excludeUserId);
  if (!ids.size) return;
  await tx.notification.createMany({
    data: [...ids].map((userId) => ({
      companyId: input.companyId,
      userId,
      type: input.type,
      message: input.message.slice(0, 300),
      postId: input.postId,
    })),
  });
}
