import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ActivityLogService } from "@/server/services/activity-log.service";
import { capturePublicPage, isCmiBrowserEnabled } from "@/server/cmi/browser-capture";
import {
  analyzeCmiEvidence,
  buildMarketingStrategy,
  getCmiAiModel,
  isCmiAiEnabled,
} from "@/server/cmi/ai-engine";

type QueryResult = { data: unknown; error: unknown };
type QueryBuilder = PromiseLike<QueryResult> & {
  select(columns: string): QueryBuilder;
  insert(input: Record<string, unknown>): QueryBuilder;
  update(input: Record<string, unknown>): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  in(column: string, values: unknown[]): QueryBuilder;
  not(column: string, operator: string, value: unknown): QueryBuilder;
  order(column: string, options: { ascending: boolean }): QueryBuilder;
  limit(count: number): QueryBuilder;
  single(): PromiseLike<QueryResult>;
  maybeSingle(): PromiseLike<QueryResult>;
};
type DbAdapter = { from(name: string): QueryBuilder };

type ResearchJobRow = {
  id: string;
  business_unit_id: string | null;
  title: string;
  objective: string;
};

type SourceRow = {
  id: string;
  research_job_id: string;
  business_unit_id?: string | null;
  url: string | null;
  title: string | null;
  metadata: unknown;
};

type EvidenceRow = {
  id: string;
  raw_text: string | null;
  source_url: string | null;
};

type OpportunityRow = {
  id: string;
  business_unit_id: string | null;
  title: string;
  customer_segment: string | null;
  problem: string;
  proposed_solution: string;
  evidence_summary: string | null;
  status: string;
};

type IdRow = { id: string };
type VersionRow = { version?: unknown };

function row<T>(value: unknown): T | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : null;
}

function rows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function priorityScore(desirability: number, feasibility: number, viability: number): number {
  return Math.round((desirability * 0.4 + feasibility * 0.3 + viability * 0.3) * 20 * 100) / 100;
}

export function getCmiAutomationStatus() {
  return {
    browserConnected: isCmiBrowserEnabled(),
    aiAnalysisConnected: isCmiAiEnabled(),
    aiModel: getCmiAiModel(),
  };
}

export class CmiAutomationService {
  private readonly adapter: DbAdapter;

  constructor(
    private readonly db: SupabaseClient<Database>,
    private readonly activityLog: ActivityLogService
  ) {
    this.adapter = db as unknown as DbAdapter;
  }

  private table(name: string): QueryBuilder {
    return this.adapter.from(name);
  }

  private async findById<T>(table: string, id: string): Promise<T | null> {
    const { data, error } = await this.table(table).select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return row<T>(data);
  }

  private async create(table: string, input: Record<string, unknown>): Promise<IdRow> {
    const { data, error } = await this.table(table).insert(input).select("*").single();
    if (error) throw error;
    const created = row<IdRow>(data);
    if (!created?.id) throw new Error(`Không nhận được ID sau khi tạo ${table}.`);
    return created;
  }

  private async update(table: string, id: string, input: Record<string, unknown>): Promise<void> {
    const { error } = await this.table(table).update(input).eq("id", id).select("id").single();
    if (error) throw error;
  }

  private async nextMarketingVersion(opportunityId: string): Promise<number> {
    const { data, error } = await this.table("marketing_strategies")
      .select("version")
      .eq("opportunity_id", opportunityId)
      .order("version", { ascending: false })
      .limit(1);
    if (error) throw error;
    return Number(rows<VersionRow>(data)[0]?.version ?? 0) + 1;
  }

  private async evidenceForResearchJob(researchJobId: string): Promise<EvidenceRow[]> {
    const sourceResult = await this.table("cmi_sources").select("id").eq("research_job_id", researchJobId);
    if (sourceResult.error) throw sourceResult.error;
    const sourceIds = rows<IdRow>(sourceResult.data).map((item) => item.id);
    if (sourceIds.length === 0) return [];

    const evidenceResult = await this.table("cmi_evidence")
      .select("*")
      .in("source_id", sourceIds)
      .not("raw_text", "is", null)
      .order("created_at", { ascending: true });
    if (evidenceResult.error) throw evidenceResult.error;
    return rows<EvidenceRow>(evidenceResult.data);
  }

  private async duplicateEvidence(sourceId: string, contentHash: string): Promise<IdRow | null> {
    const { data, error } = await this.table("cmi_evidence")
      .select("id")
      .eq("source_id", sourceId)
      .eq("content_hash", contentHash)
      .maybeSingle();
    if (error) throw error;
    return row<IdRow>(data);
  }

  private async uploadScreenshot(path: string, body: Buffer): Promise<void> {
    const { error } = await this.db.storage.from("cmi-evidence").upload(path, body, {
      contentType: "image/png",
      upsert: false,
    });
    if (error) throw error;
  }

  async captureSource(sourceId: string): Promise<{ duplicate: boolean; evidenceId: string }> {
    const source = await this.findById<SourceRow>("cmi_sources", sourceId);
    if (!source) throw new Error("Không tìm thấy nguồn cần thu thập.");
    if (!source.url) throw new Error("Nguồn chưa có đường dẫn URL.");

    const run = await this.create("cmi_research_runs", {
      research_job_id: source.research_job_id,
      run_type: "browser",
      status: "running",
      input_snapshot: { source_id: source.id, url: source.url },
      started_at: new Date().toISOString(),
    });

    try {
      const capture = await capturePublicPage(source.url);
      const duplicate = await this.duplicateEvidence(source.id, capture.contentHash);
      const metadata = {
        ...objectValue(source.metadata),
        page_title: capture.pageTitle,
        html_length: capture.htmlLength,
        content_hash: capture.contentHash,
        last_capture_at: capture.capturedAt,
      };

      if (duplicate) {
        await this.update("cmi_sources", source.id, {
          title: source.title ?? capture.pageTitle,
          capture_method: "browser",
          captured_at: capture.capturedAt,
          status: "captured",
          metadata,
        });
        await this.update("cmi_research_runs", run.id, {
          status: "completed",
          output_summary: { duplicate: true, evidence_id: duplicate.id },
          completed_at: new Date().toISOString(),
        });
        return { duplicate: true, evidenceId: duplicate.id };
      }

      let screenshotPath: string | null = null;
      if (capture.screenshot) {
        const stamp = capture.capturedAt.replace(/[:.]/g, "-");
        screenshotPath = `${source.research_job_id}/${source.id}/${stamp}-${capture.contentHash.slice(0, 12)}.png`;
        await this.uploadScreenshot(screenshotPath, capture.screenshot);
      }

      const evidence = await this.create("cmi_evidence", {
        source_id: source.id,
        evidence_type: "text",
        raw_text: capture.text,
        structured_data: {
          page_title: capture.pageTitle,
          html_length: capture.htmlLength,
          capture_method: "browser",
        },
        screenshot_path: screenshotPath,
        source_url: capture.url,
        captured_at: capture.capturedAt,
        content_hash: capture.contentHash,
        is_verified: true,
      });

      await this.update("cmi_sources", source.id, {
        title: source.title ?? capture.pageTitle,
        capture_method: "browser",
        captured_at: capture.capturedAt,
        status: "captured",
        metadata,
      });
      await this.update("cmi_research_runs", run.id, {
        status: "completed",
        output_summary: {
          duplicate: false,
          evidence_id: evidence.id,
          content_hash: capture.contentHash,
          screenshot_path: screenshotPath,
        },
        completed_at: new Date().toISOString(),
      });
      await this.activityLog.record({
        agent: "AI Nghiên cứu Khách hàng & Thị trường (CMI)",
        unit: "Nghiên cứu & Cơ hội",
        businessUnitId: null,
        message: `Browser đã thu thập bằng chứng từ ${capture.url}.`,
        type: "action",
      });
      return { duplicate: false, evidenceId: evidence.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Lỗi Browser không xác định";
      await this.update("cmi_sources", source.id, {
        status: "failed",
        metadata: {
          ...objectValue(source.metadata),
          last_capture_error: message,
          last_capture_at: new Date().toISOString(),
        },
      });
      await this.update("cmi_research_runs", run.id, {
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      });
      throw error;
    }
  }

  async analyzeResearch(researchJobId: string): Promise<{ insights: number; opportunities: number }> {
    const job = await this.findById<ResearchJobRow>("cmi_research_jobs", researchJobId);
    if (!job) throw new Error("Không tìm thấy công việc nghiên cứu.");

    const evidenceRows = await this.evidenceForResearchJob(researchJobId);
    const usableEvidence = evidenceRows.flatMap((evidence) => {
      if (typeof evidence.raw_text !== "string" || evidence.raw_text.trim().length < 50) return [];
      return [{ id: evidence.id, text: evidence.raw_text, sourceUrl: evidence.source_url ?? null }];
    });
    if (usableEvidence.length === 0) throw new Error("Chưa có bằng chứng đủ nội dung để AI phân tích.");

    const run = await this.create("cmi_research_runs", {
      research_job_id: researchJobId,
      run_type: "ai_analysis",
      status: "running",
      input_snapshot: { evidence_count: usableEvidence.length, model: getCmiAiModel() },
      started_at: new Date().toISOString(),
    });

    try {
      const analysis = await analyzeCmiEvidence({
        researchTitle: job.title,
        objective: job.objective,
        evidence: usableEvidence,
      });

      for (const insight of analysis.insights) {
        await this.create("cmi_insights", {
          research_job_id: researchJobId,
          insight_type: insight.insightType,
          title: insight.title,
          summary: insight.summary,
          customer_segment: insight.customerSegment,
          topic: insight.topic,
          frequency_count: insight.frequencyCount,
          confidence: insight.confidence,
          evidence_ids: insight.evidenceIds,
          verification_status: "partially_verified",
        });
      }

      for (const opportunity of analysis.opportunities) {
        await this.create("cmi_opportunities", {
          research_job_id: researchJobId,
          business_unit_id: job.business_unit_id,
          title: opportunity.title,
          customer_segment: opportunity.customerSegment,
          problem: opportunity.problem,
          proposed_solution: opportunity.proposedSolution,
          evidence_summary: opportunity.evidenceSummary,
          desirability_score: opportunity.desirabilityScore,
          feasibility_score: opportunity.feasibilityScore,
          viability_score: opportunity.viabilityScore,
          priority_score: priorityScore(
            opportunity.desirabilityScore,
            opportunity.feasibilityScore,
            opportunity.viabilityScore
          ),
          status: "needs_validation",
          validation_note: `AI tạo từ bằng chứng: ${opportunity.evidenceIds.join(", ")}`,
        });
      }

      await this.update("cmi_research_runs", run.id, {
        status: "completed",
        output_summary: {
          insight_count: analysis.insights.length,
          opportunity_count: analysis.opportunities.length,
          model: getCmiAiModel(),
        },
        completed_at: new Date().toISOString(),
      });
      await this.activityLog.record({
        agent: "AI Nghiên cứu Khách hàng & Thị trường (CMI)",
        unit: "Nghiên cứu & Cơ hội",
        businessUnitId: job.business_unit_id,
        message: `AI đã phân tích ${usableEvidence.length} bằng chứng, tạo ${analysis.insights.length} insight và ${analysis.opportunities.length} cơ hội cần kiểm chứng.`,
        type: "action",
      });
      return { insights: analysis.insights.length, opportunities: analysis.opportunities.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Lỗi AI không xác định";
      await this.update("cmi_research_runs", run.id, {
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      });
      throw error;
    }
  }

  async approveOpportunityAndGenerateMarketing(input: { opportunityId: string; actorUserId: string }) {
    const opportunity = await this.findById<OpportunityRow>("cmi_opportunities", input.opportunityId);
    if (!opportunity) throw new Error("Không tìm thấy cơ hội cần duyệt.");
    if (!["needs_validation", "approved_for_marketing"].includes(opportunity.status)) {
      throw new Error("Cơ hội hiện không ở trạng thái cho phép gửi sang AI Marketing.");
    }

    await this.update("cmi_opportunities", opportunity.id, {
      status: "approved_for_marketing",
      approved_by: input.actorUserId,
      approved_at: new Date().toISOString(),
      validation_note: "Quản lý đã duyệt để AI Marketing tạo chiến lược cần test.",
    });

    const marketing = await buildMarketingStrategy({
      opportunity: {
        title: opportunity.title,
        customerSegment: opportunity.customer_segment,
        problem: opportunity.problem,
        proposedSolution: opportunity.proposed_solution,
        evidenceSummary: opportunity.evidence_summary,
      },
    });
    const version = await this.nextMarketingVersion(opportunity.id);
    const strategy = await this.create("marketing_strategies", {
      opportunity_id: opportunity.id,
      business_unit_id: opportunity.business_unit_id,
      version,
      target_customer: marketing.targetCustomer,
      positioning: marketing.positioning,
      value_proposition: marketing.valueProposition,
      marketing_ideas: marketing.marketingIdeas,
      channel_strategy: marketing.channelStrategy,
      test_hypotheses: marketing.testHypotheses,
      kpis: marketing.kpis,
      assumptions: marketing.assumptions,
      risks: marketing.risks,
      status: "needs_review",
      created_by_agent: "AI_MARKETING",
    });
    await this.activityLog.record({
      agent: "AI Marketing",
      unit: "Chiến lược Marketing",
      businessUnitId: opportunity.business_unit_id,
      message: `Đã tạo chiến lược Marketing V${version} cho cơ hội “${opportunity.title}”. Nội dung vẫn là giả thuyết cần test.`,
      type: "action",
    });
    return strategy;
  }
}
