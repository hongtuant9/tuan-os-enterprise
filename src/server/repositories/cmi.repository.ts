import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * V0.1 dùng ép kiểu cục bộ vì file Database types hiện tại chưa có các bảng migration 0013.
 * Sau khi chạy migration và regenerate Supabase types, có thể bỏ `as any`.
 */
export class CmiRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  private table(name: string) {
    return (this.db as any).from(name);
  }

  async listResearchJobs() {
    const { data, error } = await this.table("cmi_research_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  }

  async listSources() {
    const { data, error } = await this.table("cmi_sources")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  }

  async listEvidence() {
    const { data, error } = await this.table("cmi_evidence")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  }

  async listInsights() {
    const { data, error } = await this.table("cmi_insights")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  }

  async listOpportunities() {
    const { data, error } = await this.table("cmi_opportunities")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  }

  async listMarketingStrategies() {
    const { data, error } = await this.table("marketing_strategies")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  }

  async createResearchJob(input: Record<string, unknown>) {
    const { data, error } = await this.table("cmi_research_jobs")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async createSource(input: Record<string, unknown>) {
    const { data, error } = await this.table("cmi_sources")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async createEvidence(input: Record<string, unknown>) {
    const { data, error } = await this.table("cmi_evidence")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async createInsight(input: Record<string, unknown>) {
    const { data, error } = await this.table("cmi_insights")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async createOpportunity(input: Record<string, unknown>) {
    const { data, error } = await this.table("cmi_opportunities")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async createMarketingStrategy(input: Record<string, unknown>) {
    const { data, error } = await this.table("marketing_strategies")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
}
