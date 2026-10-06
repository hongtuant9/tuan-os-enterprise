export type ReceptionistSafetyMode = "off" | "simulation" | "shadow" | "limited_auto" | "live";

export function autoReplyGate(
  mode: ReceptionistSafetyMode,
  ownerApproved: boolean,
): boolean {
  return (mode === "limited_auto" || mode === "live") && ownerApproved;
}

export function directBookingWriteGate(
  mode: ReceptionistSafetyMode,
  pilotWriteEnabled: boolean,
  directBookingAutoCreateEnabled: boolean,
): boolean {
  return (
    (mode === "limited_auto" || mode === "live")
    && pilotWriteEnabled
    && directBookingAutoCreateEnabled
  );
}
