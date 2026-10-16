// Publishing adapters. No live provider integration ships with the MVP: platform APIs need app review,
// OAuth scopes and legal sign-off first (PRD 16, 18). The default mode therefore fails honestly with a reason
// instead of pretending to publish. PUBLISHER_MODE=simulate exists for development and is labelled in the UI.

import type { ChannelConnection, PostVariant } from "@prisma/client";
import { PLATFORM_LABEL } from "@/lib/domain";

export type PublishOutcome = { ok: true; externalId: string; via: "live" | "simulated" } | { ok: false; error: string };

export interface PublisherAdapter {
  publish(variant: PostVariant, connection: ChannelConnection): Promise<PublishOutcome>;
}

/** Register real adapters here, e.g. `linkedin: new LinkedInAdapter()`, once credentials and review exist. */
const LIVE_ADAPTERS: Partial<Record<PostVariant["platform"], PublisherAdapter>> = {};

export function publisherMode(): "none" | "simulate" {
  return process.env.PUBLISHER_MODE === "simulate" ? "simulate" : "none";
}

const simulated: PublisherAdapter = {
  async publish(variant) {
    return { ok: true, externalId: `sim_${variant.id}_${Date.now()}`, via: "simulated" };
  },
};

export async function publishVariant(
  variant: PostVariant,
  connection: ChannelConnection | undefined,
): Promise<PublishOutcome> {
  const label = PLATFORM_LABEL[variant.platform];
  if (!connection || connection.connectionStatus !== "connected") {
    return { ok: false, error: `${label} is not connected.` };
  }
  if (connection.simulated) {
    if (publisherMode() !== "simulate") return { ok: false, error: `${label} has only a simulated connection; live publishing is not configured.` };
    return simulated.publish(variant, connection);
  }
  const adapter = LIVE_ADAPTERS[variant.platform];
  if (!adapter) return { ok: false, error: `No live publishing integration is configured for ${label}.` };
  try {
    return await adapter.publish(variant, connection);
  } catch (e) {
    return { ok: false, error: `${label} publish error: ${e instanceof Error ? e.message : "unknown error"}` };
  }
}
