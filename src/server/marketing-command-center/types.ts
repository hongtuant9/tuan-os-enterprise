import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type MarketingVerification = "VERIFIED" | "PARTIAL" | "NEED_VERIFY" | "HOLD";

export type MarketingPerformanceRow = {
  channelId: string;
  channelName: string;
  spend: number;
  leads: number;
  bookings: number;
  revenue: number;
  impressions: number;
  reach: number;
  clicks: number;
  engagements: number;
  sessions: number;
  cpa: number | null;
  roas: number | null;
  verification: MarketingVerification;
};

export type MarketingCommandCenterSnapshot = {
  period: { from: string; to: string };
  totals: {
    impressions: number;
    reach: number;
    clicks: number;
    engagements: number;
    sessions: number;
    leads: number;
    bookings: number;
    spend: number;
    revenue: number;
    cpa: number | null;
    roas: number | null;
    reachVerified: boolean;
    spendVerified: boolean;
    attributionCoverage: number | null;
  };
  channels: MarketingPerformanceRow[];
  campaigns: Array<Record<string, unknown>>;
  content: Array<Record<string, unknown>>;
  attribution: Array<Record<string, unknown>>;
  connectors: Array<Record<string, unknown>>;
  recommendations: Array<Record<string, unknown>>;
  marketIntelligence: Array<Record<string, unknown>>;
  sourceState: "LIVE" | "PARTIAL" | "NEED_VERIFY";
};

export type MarketingDbClient = SupabaseClient<Database>;
