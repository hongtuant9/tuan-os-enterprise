export type ProviderTransport =
  | "official_api"
  | "webhook"
  | "self_hosted_browser_fallback"
  | "partner_api_required"
  | "manual_hold";

export type ProviderRuntime = {
  provider: string;
  transport: ProviderTransport;
  configured: boolean;
  writeEnabled: boolean;
  note: string;
};

function has(...names: string[]): boolean {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

function enabled(name: string): boolean {
  return (process.env[name] ?? "false").trim().toLowerCase() === "true";
}

export function providerTransportSnapshot(): ProviderRuntime[] {
  return [
    {
      provider: "Google Workspace",
      transport: "official_api",
      configured: has("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"),
      writeEnabled: true,
      note: "Drive/Sheets/Docs/Gmail dùng OAuth + Google APIs; quyền thực tế theo scope.",
    },
    {
      provider: "Google Ads",
      transport: "official_api",
      configured: has("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_ADS_CUSTOMER_ID"),
      writeEnabled: enabled("GOOGLE_ADS_WRITE_ENABLED"),
      note: "Google Ads API v25; write fail-closed và approval-gated.",
    },
    {
      provider: "Meta Facebook",
      transport: "official_api",
      configured: has("FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET", "FACEBOOK_VERIFY_TOKEN"),
      writeEnabled: enabled("TCE_META_REPLY_GATE_APPROVED"),
      note: "Meta Graph API + Webhook; outbound theo gate hiện hành.",
    },
    {
      provider: "WhatsApp",
      transport: "official_api",
      configured: has("WHATSAPP_APP_SECRET", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"),
      writeEnabled: enabled("AI_PILOT_OUTBOUND_ENABLED"),
      note: "WhatsApp Cloud API + Webhook.",
    },
    {
      provider: "KiotViet Hotel",
      transport: "official_api",
      configured: has("KIOTVIET_HOTEL_API_BASE_URL", "KIOTVIET_HOTEL_PUBLIC_API_KEY"),
      writeEnabled: enabled("KIOTVIET_HOTEL_DIRECT_BOOKING_AUTO_CREATE_ENABLED"),
      note: "API chính chủ ưu tiên; browser chỉ fallback cho chức năng API chưa cung cấp.",
    },
    {
      provider: "KiotViet F&B",
      transport: has("KIOTVIET_FNB_CLIENT_ID", "KIOTVIET_FNB_CLIENT_SECRET")
        ? "official_api"
        : "self_hosted_browser_fallback",
      configured:
        has("KIOTVIET_FNB_CLIENT_ID", "KIOTVIET_FNB_CLIENT_SECRET") ||
        has("KIOTVIET_FNB_WEB_URL", "KIOTVIET_FNB_WEB_USERNAME", "KIOTVIET_FNB_WEB_PASSWORD"),
      writeEnabled: false,
      note: "API ưu tiên; Chromium self-hosted chỉ dùng read-back/fallback khi API thiếu endpoint.",
    },
    {
      provider: "Zalo OA",
      transport: "official_api",
      configured: has("ZALO_APP_ID", "ZALO_OA_SECRET_KEY", "ZALO_OA_ACCESS_TOKEN"),
      writeEnabled: false,
      note: "Zalo OA API; chỉ mở outbound sau verification/approval riêng.",
    },
    {
      provider: "OTA",
      transport: "partner_api_required",
      configured: false,
      writeEnabled: false,
      note: "Booking/Agoda/Airbnb/Expedia chỉ dùng partner API khi được cấp; không browser-login automation để giả lập API.",
    },
    {
      provider: "Nghiên cứu web công khai",
      transport: "self_hosted_browser_fallback",
      configured: enabled("CMI_BROWSER_ENABLED"),
      writeEnabled: false,
      note: "Chromium headless self-hosted trong Docker; DOM/text là evidence chính, không dùng SaaS browser.",
    },
  ];
}
