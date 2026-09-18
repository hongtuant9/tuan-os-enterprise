import type { TceAgentId } from "@/server/agents/tce-registry";

export type MarketingCapabilityDefinition = {
  capability: string;
  preferredAgentId?: TceAgentId;
  fallbackAgentId?: TceAgentId;
  financialMutation: boolean;
};

export const MARKETING_CAPABILITY_MAP: MarketingCapabilityDefinition[] = [
  { capability: "brand_governance", preferredAgentId: "marketing_manager", fallbackAgentId: "manager_agent", financialMutation: false },
  { capability: "market_intelligence", preferredAgentId: "marketing_manager", fallbackAgentId: "channel_auditor", financialMutation: false },
  { capability: "marketing_planning", preferredAgentId: "marketing_manager", fallbackAgentId: "manager_agent", financialMutation: false },
  { capability: "content_strategy", preferredAgentId: "marketing_manager", fallbackAgentId: "manager_agent", financialMutation: false },
  { capability: "content_generation", preferredAgentId: "marketing_manager", fallbackAgentId: "manager_agent", financialMutation: false },
  { capability: "social_publishing", preferredAgentId: "marketing_manager", fallbackAgentId: "computer_operator", financialMutation: false },
  { capability: "paid_media_analysis", preferredAgentId: "ads_agent", financialMutation: false },
  { capability: "paid_media_mutation", preferredAgentId: "ads_agent", financialMutation: true },
  { capability: "seo_local", preferredAgentId: "website_agent", fallbackAgentId: "channel_auditor", financialMutation: false },
  { capability: "reputation_management", preferredAgentId: "reputation", financialMutation: false },
  { capability: "crm_lifecycle", preferredAgentId: "upsell", fallbackAgentId: "marketing_manager", financialMutation: false },
  { capability: "conversion_optimization", preferredAgentId: "website_agent", fallbackAgentId: "marketing_manager", financialMutation: false },
  { capability: "marketing_analytics", preferredAgentId: "marketing_manager", fallbackAgentId: "data_quality", financialMutation: false },
  { capability: "cross_sell", preferredAgentId: "upsell", fallbackAgentId: "marketing_manager", financialMutation: false },
  { capability: "channel_audit", preferredAgentId: "channel_auditor", financialMutation: false },
  { capability: "pricing_yield_input", preferredAgentId: "revenue_yield", financialMutation: true },
];

export function resolveMarketingCapability(capability: string): MarketingCapabilityDefinition | undefined {
  return MARKETING_CAPABILITY_MAP.find((item) => item.capability === capability);
}
