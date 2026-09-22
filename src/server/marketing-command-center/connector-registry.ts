import "server-only";

export type MarketingConnectorDefinition = {
  id: string;
  phase: 1 | 2 | 3 | 4;
  provider: string;
  purpose: string;
  actualAuthority: string;
  directRead: boolean;
  writeMode: "DISABLED" | "APPROVAL_GATED";
  requiredConfiguration: string[];
};

export const MARKETING_CONNECTOR_REGISTRY: readonly MarketingConnectorDefinition[] = [
  { id: "ga4", phase: 1, provider: "Google Analytics 4", purpose: "Website traffic/events", actualAuthority: "GA4 Data API", directRead: true, writeMode: "DISABLED", requiredConfiguration: ["Google OAuth analytics.readonly"] },
  { id: "google_ads", phase: 1, provider: "Google Ads", purpose: "Paid impressions/clicks/spend/conversions", actualAuthority: "Google Ads API", directRead: true, writeMode: "APPROVAL_GATED", requiredConfiguration: ["OAuth adwords scope", "developer token", "customer id"] },
  { id: "meta_ads", phase: 1, provider: "Meta Ads", purpose: "Paid reach/clicks/spend/results", actualAuthority: "Meta Marketing API", directRead: true, writeMode: "APPROVAL_GATED", requiredConfiguration: ["ads_read token", "ad account id"] },
  { id: "facebook_organic", phase: 2, provider: "Meta Graph API", purpose: "Facebook post/page organic analytics", actualAuthority: "Meta Graph API", directRead: true, writeMode: "APPROVAL_GATED", requiredConfiguration: ["Page token + insights scope"] },
  { id: "instagram_organic", phase: 2, provider: "Meta Graph API", purpose: "Instagram organic analytics", actualAuthority: "Meta Graph API", directRead: true, writeMode: "APPROVAL_GATED", requiredConfiguration: ["IG business id + insights scope"] },
  { id: "google_business_profile", phase: 2, provider: "Google Business Profile", purpose: "Local discovery/call/direction metrics", actualAuthority: "GBP APIs", directRead: true, writeMode: "APPROVAL_GATED", requiredConfiguration: ["business.manage OAuth + API access"] },
  { id: "booking_runtime", phase: 2, provider: "Booking.com", purpose: "OTA acquisition/booking attribution", actualAuthority: "Authenticated partner/runtime", directRead: true, writeMode: "APPROVAL_GATED", requiredConfiguration: ["Partner API/runtime access"] },
  { id: "agoda_runtime", phase: 2, provider: "Agoda", purpose: "OTA acquisition/booking attribution", actualAuthority: "Authenticated partner/runtime", directRead: true, writeMode: "APPROVAL_GATED", requiredConfiguration: ["Partner API/runtime access"] },
  { id: "airbnb_runtime", phase: 2, provider: "Airbnb", purpose: "OTA acquisition/booking attribution", actualAuthority: "Authenticated runtime", directRead: true, writeMode: "APPROVAL_GATED", requiredConfiguration: ["Authorized runtime access"] },
  { id: "expedia_runtime", phase: 2, provider: "Expedia", purpose: "OTA acquisition/booking attribution", actualAuthority: "Authenticated partner/runtime", directRead: true, writeMode: "APPROVAL_GATED", requiredConfiguration: ["Partner API/runtime access"] },
  { id: "tripadvisor_runtime", phase: 2, provider: "Tripadvisor", purpose: "Reputation/referral analytics", actualAuthority: "Authenticated owner/runtime", directRead: true, writeMode: "APPROVAL_GATED", requiredConfiguration: ["Owner/API runtime access"] },
  { id: "hospitality_crm", phase: 3, provider: "TUAN OS", purpose: "Lead/customer/source attribution", actualAuthority: "Supabase Hospitality CRM", directRead: true, writeMode: "DISABLED", requiredConfiguration: [] },
  { id: "ai_receptionist", phase: 3, provider: "TUAN OS", purpose: "Conversation/booking events", actualAuthority: "Supabase AI Receptionist", directRead: true, writeMode: "DISABLED", requiredConfiguration: [] },
  { id: "kiotviet_hotel", phase: 3, provider: "KiotViet", purpose: "Verified Hotel revenue/booking runtime", actualAuthority: "KiotViet Hotel API", directRead: true, writeMode: "DISABLED", requiredConfiguration: ["KiotViet Hotel read credentials"] },
  { id: "kiotviet_fnb", phase: 3, provider: "KiotViet", purpose: "Verified F&B revenue runtime", actualAuthority: "KiotViet F&B API", directRead: true, writeMode: "DISABLED", requiredConfiguration: ["KiotViet F&B read credentials"] },
] as const;
