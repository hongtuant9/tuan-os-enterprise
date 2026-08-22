import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type QueryListResult = {
  data: unknown[] | null;
  error: unknown;
};

type QuerySingleResult = {
  data: unknown;
  error: unknown;
};

type SelectQuery = {
  neq(column: string, value: unknown): SelectQuery;
  order(column: string, options: { ascending: boolean }): SelectQuery;
  limit(count: number): PromiseLike<QueryListResult>;
};

type InsertSelectQuery = {
  single(): PromiseLike<QuerySingleResult>;
};

type InsertQuery = {
  select(columns: string): InsertSelectQuery;
};

type TableQuery = {
  select(columns: string): SelectQuery;
  insert(input: Record<string, unknown>): InsertQuery;
};

type CmiDbAdapter = {
  from(name: string): TableQuery;
};

/**
 * Adapter tạm thời cho các bảng CMI chưa có trong file Database types hiện tại.
 * Dùng unknown thay cho any để giữ type-safety và vẫn cho phép lint kiểm soát.
 * Khi regenerate Supabase types sau migration, có thể bỏ adapter này.
 */
export class CmiRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  private table(name: string): TableQuery {
    return (this.db as unknown as CmiDbAdapter).from(name);
  }

  async listResearchJobs(): Promise<unknown[]> {
    const { data, error } = await this.table("cmi_research_jobs")
      .select("*")
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  }

  async listCompetitors(): Promise<unknown[]> {
    const { data, error } = await this.table("cmi_competitors")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw error;
    return data ?? [];
  }

  async listSources(): Promise<unknown[]> {
    const { data, error } = await this.table("cmi_sources")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  }

  async listEvidence(): Promise<unknown[]> {
    const { data, error } = await this.table("cmi_evidence")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  }

  async listInsights(): Promise<unknown[]> {
    const { data, error } = await this.table("cmi_insights")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  }

  async listOpportunities(): Promise<unknown[]> {
    const { data, error } = await this.table("cmi_opportunities")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  }

  async listMarketingStrategies(): Promise<unknown[]> {
    const { data, error } = await this.table("marketing_strategies")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  }

  async createResearchJob(input: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.table("cmi_research_jobs")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async createSource(input: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.table("cmi_sources")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async createEvidence(input: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.table("cmi_evidence")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async createInsight(input: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.table("cmi_insights")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async createOpportunity(input: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.table("cmi_opportunities")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async createMarketingStrategy(input: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.table("marketing_strategies")
      .insert(input)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
}
