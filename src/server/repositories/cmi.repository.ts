import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * CMI dùng ép kiểu cục bộ cho các bảng migration mới cho tới khi regenerate Supabase types.
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

  async findResearchJobById(id: string) {
    const { data, error } = await this.table("cmi_research_jobs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findSourceById(id: string) {
    const { data, error } = await this.table("cmi_sources")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findOpportunityById(id: string) {
    const { data, error } = await this.table("cmi_opportunities")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findEvidenceForResearchJob(researchJobId: string) {
    const { data: sourceRows, error: sourceError } = await this.table("cmi_sources")
      .select("id")
      .eq("research_job_id", researchJobId);
    if (sourceError) throw sourceError;

    const sourceIds = (sourceRows ?? []).map((row: { id: string }) => row.id);
    if (sourceIds.length === 0) return [];

    const { data, error } = await this.table("cmi_evidence")
      .select("*")
      .in("source_id", sourceIds)
      .not("raw_text", "is", null)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async findEvidenceByHash(sourceId: string, contentHash: string) {
    const { data, error } = await this.table("cmi_evidence")
      .select("*")
      .eq("source_id", sourceId)
      .eq("content_hash", contentHash)
      .maybeSingle();
    if (error) throw error;
    return data;
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

  async updateSource(id: string, input: Record<string, unknown>) {
    const { data, error } = await this.table("cmi_sources")
      .update(input)
      .eq("id", id)
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

  async updateOpportunity(id: string, input: Record<string, unknown>) {
    const { data, error } = await this.table("cmi_opportunities")
      .update(input)
      .eq("id", id)
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

  async nextMarketingStrategyVersion(opportunityId: string): Promise<number> {
    const { data, error } = await this.table("marketing_strategies")
      .select("version")
      .eq("opportunity_id", opportunityId)
      .order("version", { ascending: false })
      .limit(1);
    if (error) throw error;
    return Number(data?.[0]?.version ?? 0) + 1;
  }

  async createResearchRun(input: Record<string, unknown>) {
    const { data, error } = await this.table("cmi_research_runs")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async updateResearchRun(id: string, input: Record<string, unknown>) {
    const { data, error } = await this.table("cmi_research_runs")
      .update(input)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async uploadScreenshot(path: string, body: Buffer): Promise<void> {
    const { error } = await this.db.storage
      .from("cmi-evidence")
      .upload(path, body, {
        contentType: "image/png",
        upsert: false,
      });
    if (error) throw error;
  }
}
