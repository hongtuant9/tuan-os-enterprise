import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { CmiBusinessLine } from "@/data/cmi";
import type { ActivityLogService } from "@/server/services/activity-log.service";
import { discoverCompetitors } from "@/server/cmi/competitor-discovery";

type QueryResult = { data: unknown; error: unknown };
type QueryBuilder = PromiseLike<QueryResult> & {
  select(columns: string): QueryBuilder;
  insert(input: Record<string, unknown>): QueryBuilder;
  update(input: Record<string, unknown>): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  in(column: string, values: unknown[]): QueryBuilder;
  order(column: string, options: { ascending: boolean }): QueryBuilder;
  limit(count: number): QueryBuilder;
  single(): PromiseLike<QueryResult>;
  maybeSingle(): PromiseLike<QueryResult>;
};
type DbAdapter = { from(name: string): QueryBuilder };

type ResearchJobRow = {
  id: string;
  business_line: CmiBusinessLine;
  title: string;
  objective: string;
};

type CompetitorRow = {
  id: string;
  research_job_id: string;
  name: string;
  primary_url: string | null;
  platform: string | null;
  source_urls: unknown;
  selection_status: string;
};

type SourceRow = { url: string | null };

type IdRow = { id: string };

function row<T>(value: unknown): T | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : null;
}

function rows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function urls(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && /^https?:\/\//i.test(item))
    : [];
}

export class CmiCompetitorService {
  private readonly adapter: DbAdapter;

  constructor(
    db: SupabaseClient<Database>,
    private readonly activityLog: ActivityLogService
  ) {
    this.adapter = db as unknown as DbAdapter;
  }

  private table(name: string): QueryBuilder {
    return this.adapter.from(name);
  }

  private async findJob(id: string): Promise<ResearchJobRow> {
    const { data, error } = await this.table("cmi_research_jobs").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    const job = row<ResearchJobRow>(data);
    if (!job) throw new Error("Không tìm thấy nghiên cứu.");
    return job;
  }

  async discover(researchJobId: string): Promise<number> {
    const job = await this.findJob(researchJobId);
    const existingResult = await this.table("cmi_competitors")
      .select("id")
      .eq("research_job_id", researchJobId)
      .limit(1);
    if (existingResult.error) throw existingResult.error;
    if (rows<IdRow>(existingResult.data).length > 0) {
      throw new Error("Nghiên cứu này đã có danh sách đối thủ. Hãy chọn đối thủ trong danh sách hiện có.");
    }

    const discovered = await discoverCompetitors({
      businessLine: job.business_line,
      researchTitle: job.title,
      objective: job.objective,
      limit: 30,
    });

    for (const competitor of discovered) {
      const { error } = await this.table("cmi_competitors").insert({
        research_job_id: researchJobId,
        name: competitor.name,
        rank: competitor.rank,
        score: competitor.score,
        primary_url: competitor.primaryUrl,
        platform: competitor.platform,
        rationale: competitor.rationale,
        source_urls: competitor.sourceUrls,
        discovery_evidence: { source_urls: competitor.sourceUrls },
        selection_status: "candidate",
      });
      if (error) throw error;
    }

    await this.activityLog.record({
      agent: "AI Nghiên cứu Khách hàng & Thị trường (CMI)",
      unit: "Nghiên cứu & Cơ hội",
      businessUnitId: null,
      message: `AI đã đề xuất ${discovered.length} đối thủ cho nghiên cứu “${job.title}”. Chưa tự chọn thay Quản lý.`,
      type: "action",
    });
    return discovered.length;
  }

  async selectAndCreateSources(input: { researchJobId: string; selectedIds: string[] }): Promise<number> {
    if (input.selectedIds.length === 0) throw new Error("Cần chọn ít nhất một đối thủ.");
    if (input.selectedIds.length > 30) throw new Error("Tối đa 30 đối thủ cho một nghiên cứu.");
    const job = await this.findJob(input.researchJobId);

    const result = await this.table("cmi_competitors")
      .select("*")
      .eq("research_job_id", input.researchJobId)
      .order("rank", { ascending: true });
    if (result.error) throw result.error;
    const competitors = rows<CompetitorRow>(result.data);
    const selectedSet = new Set(input.selectedIds);

    for (const competitor of competitors) {
      const { error } = await this.table("cmi_competitors")
        .update({ selection_status: selectedSet.has(competitor.id) ? "selected" : "rejected" })
        .eq("id", competitor.id)
        .select("id")
        .single();
      if (error) throw error;
    }

    const existingSourceResult = await this.table("cmi_sources")
      .select("url")
      .eq("research_job_id", input.researchJobId);
    if (existingSourceResult.error) throw existingSourceResult.error;
    const existingUrls = new Set(
      rows<SourceRow>(existingSourceResult.data).map((item) => item.url).filter((url): url is string => Boolean(url))
    );

    let created = 0;
    for (const competitor of competitors.filter((item) => selectedSet.has(item.id))) {
      const candidateUrls = Array.from(new Set([competitor.primary_url, ...urls(competitor.source_urls)].filter((url): url is string => Boolean(url))));
      for (const url of candidateUrls.slice(0, 8)) {
        if (existingUrls.has(url)) continue;
        const { error } = await this.table("cmi_sources").insert({
          research_job_id: input.researchJobId,
          platform: competitor.platform || new URL(url).hostname,
          source_type: "web_page",
          url,
          title: null,
          competitor_name: competitor.name,
          capture_method: "manual",
          status: "pending",
          metadata: { competitor_id: competitor.id, discovery: "ai_web_search" },
        });
        if (error) throw error;
        existingUrls.add(url);
        created += 1;
      }
    }

    await this.activityLog.record({
      agent: "AI Nghiên cứu Khách hàng & Thị trường (CMI)",
      unit: "Nghiên cứu & Cơ hội",
      businessUnitId: null,
      message: `Quản lý đã chọn ${input.selectedIds.length} đối thủ cho “${job.title}”; tạo ${created} nguồn Browser cần thu thập.`,
      type: "action",
    });
    return created;
  }
}
