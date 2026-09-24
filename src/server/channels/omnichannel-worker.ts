import { channelPolicySnapshot, type CustomerChannelId } from "@/server/channels/channel-policy";

export type OmnichannelWorkerResult = {
  checkedAt: string;
  checked: number;
  activePollers: number;
  holds: Array<{ channel: CustomerChannelId; reason: string }>;
  ready: Array<{ channel: CustomerChannelId; transport: string }>;
};

const POLLABLE_CHANNELS: readonly CustomerChannelId[] = [
  "email",
  "booking",
  "agoda",
  "airbnb",
  "expedia",
  "tripadvisor",
];

export async function runOmnichannelWorkerCycle(): Promise<OmnichannelWorkerResult> {
  const snapshot = channelPolicySnapshot();
  const holds: OmnichannelWorkerResult["holds"] = [];
  const ready: OmnichannelWorkerResult["ready"] = [];

  for (const channelId of POLLABLE_CHANNELS) {
    const channel = snapshot.channels.find((item) => item.id === channelId);
    if (!channel) {
      holds.push({ channel: channelId, reason: "channel_not_registered" });
      continue;
    }
    if (channel.mode !== "PRIVATE_PILOT") {
      holds.push({ channel: channelId, reason: "channel_closed" });
      continue;
    }
    if (channel.providerConfig !== "CONFIGURED") {
      holds.push({ channel: channelId, reason: "provider_not_configured" });
      continue;
    }
    if (channel.providerVerification !== "VERIFIED_PILOT") {
      holds.push({ channel: channelId, reason: "provider_not_verified" });
      continue;
    }

    // Fail closed. A poller must be registered only after the provider's official API,
    // auth scope, cursor/idempotency behavior and UAT have been verified.
    holds.push({ channel: channelId, reason: "poll_adapter_not_registered" });
  }

  const webhookReady = snapshot.channels.filter((channel) =>
    channel.mode === "PRIVATE_PILOT" &&
    channel.transport === "webhook" &&
    channel.providerConfig === "CONFIGURED" &&
    channel.providerVerification === "VERIFIED_PILOT"
  );
  for (const channel of webhookReady) {
    ready.push({ channel: channel.id, transport: channel.transport });
  }

  return {
    checkedAt: new Date().toISOString(),
    checked: POLLABLE_CHANNELS.length,
    activePollers: 0,
    holds,
    ready,
  };
}
