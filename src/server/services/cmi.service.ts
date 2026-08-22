import type { CmiDashboard } from "@/data/cmi";
import { CmiRepository } from "@/server/repositories/cmi.repository";
import { ActivityLogService } from "@/server/services/activity-log.service";
import { capturePublicPage, isCmiBrowserEnabled } from "@/server/cmi/browser-capture";
import {
  analyzeCmiEvidence,
  buildMarketingStrategy,
  getCmiAiModel,
  isCmiAiEnabled,
} from "@/server/cmi/ai-engine";

function n(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function priorityScore(desirability: number, feasibility: number, viability: number): number {
  return Math.round((desirability * 0.4 + feasibility * 0.3 + viability * 0.3) * 20 * 100) / 100;
}

export class CmiService {
  constructor(
    private readonly repo: CmiRepository,
    private readonly activityLog: ActivityLogService
  ) {}

  async dashboard(): Promise<CmiDashboard> {
    const [jobs, sources, evidence, insights, opportunities, strategies] = await Promise.all([
      this.repo.listResearchJobs(),
      this.repo.listSources(),
      this.repo.listEvidence(),
      this.repo.listInsights(),
      this.repo.listOpportunities(),
      this.repo.listMarketingStrategies(),
    ]);

    const browserEnabled = isCmiBrowserEnabled();
    const aiEnabled = isCmiAiEnabled();

    return {
      researchJobs: jobs.map((r: any) => ({
        id: r.id,
        businessUnitId: r.business_unit_id,
        title: r.title,
        objective: r.objective,
        researchType: r.research_type,
        status: r.status,
        createdAt: r.created_at,
      })),
      sources: sources.map((r: any) => ({
        id: r.id,
        researchJobId: r.research_job_id,
        platform: r.platform,
        sourceType: r.source_type,
        url: r.url,
        title: r.title,
        competitorName: r.competitor_name,
        captureMethod: r.capture_method,
        status: r.status,
        capturedAt: r.captured_at,
        createdAt: r.created_at,
      })),
      evidence: evidence.map((r: any) => ({
        id: r.id,
        sourceId: r.source_id,
        evidenceType: r.evidence_type,
        rawText: r.raw_text,
        screenshotPath: r.screenshot_path,
        sourceUrl: r.source_url,
        contentHash: r.content_hash ?? null,
        isVerified: Boolean(r.is_verified),
        capturedAt: r.captured_at,
      })),
      insights: insights.map((r: any) => ({
        id: r.id,
        researchJobId: r.research_job_id,
        insightType: r.insight_type,
        title: r.title,
        summary: r.summary,
        customerSegment: r.customer_segment,
        topic: r.topic,
        frequencyCount: Number(r.frequency_count ?? 0),
        confidence: n(r.confidence),
        verificationStatus: r.verification_status,
      })),
      opportunities: opportunities.map((r: any) => ({
        id: r.id,
        researchJobId: r.research_job_id,
        businessUnitId: r.business_unit_id,
        title: r.title,
        customerSegment: r.customer_segment,
        problem: r.problem,
        proposedSolution: r.proposed_solution,
        evidenceSummary: r.evidence_summary,
        currentCapability: r.current_capability,
        capabilityGap: r.capability_gap,
        desirabilityScore: n(r.desirability_score),
        feasibilityScore: n(r.feasibility_score),
        viabilityScore: n(r.viability_score),
        priorityScore: n(r.priority_score),
        status: r.status,
      })),
      marketingStrategies: strategies.map((r: any) => ({
        id: r.id,
        opportunityId: r.opportunity_id,
        version: r.version,
        targetCustomer: r.target_customer,
        positioning: r.positioning,
        valueProposition: r.value_proposition,
        marketingIdeas: Array.isArray(r.marketing_ideas) ? r.marketing_ideas : [],
        channelStrategy: Array.isArray(r.channel_strategy) ? r.channel_strategy : [],
        testHypotheses: Array.isArray(r.test_hypotheses) ? r.test_hypotheses : [],
        kpis: Array.isArray(r.kpis) ? r.kpis : [],
        assumptions: Array.isArray(r.assumptions) ? r.assumptions : [],
        risks: Array.isArray(r.risks) ? r.risks : [],
        status: r.status,
      })),
      metrics: {
        researchJobs: jobs.length,
        evidence: evidence.length,
        verifiedEvidence: evidence.filter((x: any) => x.is_verified).length,
        insights: insights.length,
        opportunities: opportunities.length,
        marketingStrategies: strategies.length,
      },
      automation: {
        browserConnected: browserEnabled,
        aiAnalysisConnected: aiEnabled,
        aiModel: getCmiAiModel(),
        note: browserEnabled
          ? aiEnabled
            ? "V0.2: Browser và AI đã được bật. AI chỉ phân tích bằng chứng đã lưu; cơ hội vẫn cần Quản lý duyệt trước khi tạo chiến lược Marketing."
            : "V0.2: Browser đã bật. AI chưa được kích hoạt nên chưa phát sinh chi phí API."
          : "V0.2 đã có trong code nhưng Browser đang tắt theo cấu hình an toàn; dữ liệu thủ công V0.1 vẫn dùng bình thường.",
      },
    };
  }

  async createResearchJob(input: {
    title: string;
    objective: string;
    researchType: string;
    businessUnitId?: string | null;
    createdBy?: string | null;
  }) {
    if (!input.title.trim() || !input.objective.trim()) {
      throw new Error("Tên nghiên cứu và mục tiêu nghiên cứu là bắt buộc.");
    }
    const row = await this.repo.createResearchJob({
      business_unit_id: input.businessUnitId ?? null,
      title: input.title.trim(),
      objective: input.objective.trim(),
      research_type: input.researchType,
      status: "draft",
      created_by: input.createdBy ?? null,
    });
    await this.activityLog.record({
      agent: "AI Nghiên cứu Khách hàng & Thị trường (CMI)",
      unit: "Nghiên cứu & Cơ hội",
      businessUnitId: input.businessUnitId ?? null,
      message: `Đã tạo công việc nghiên cứu: ${input.title.trim()}.`,
      type: "action",
    });
    return row;
  }

  async createSource(input: {
    researchJobId: string;
    platform: string;
    sourceType: string;
    url?: string;
    title?: string;
    competitorName?: string;
  }) {
    if (!input.researchJobId) throw new Error("Chưa chọn công việc nghiên cứu.");
    return this.repo.createSource({
      research_job_id: input.researchJobId,
      platform: input.platform || "website",
      source_type: input.sourceType || "web_page",
      url: input.url?.trim() || null,
      title: input.title?.trim() || null,
      competitor_name: input.competitorName?.trim() || null,
      capture_method: "manual",
      status: "pending",
    });
  }

  async createEvidence(input: {
    sourceId: string;
    evidenceType: string;
    rawText: string;
    sourceUrl?: string;
    isVerified?: boolean;
  }) {
    if (!input.sourceId) throw new Error("Chưa chọn nguồn.");
    if (!input.rawText.trim()) throw new Error("Nội dung bằng chứng không được để trống.");
    return this.repo.createEvidence({
      source_id: input.sourceId,
      evidence_type: input.evidenceType || "text",
      raw_text: input.rawText.trim(),
      source_url: input.sourceUrl?.trim() || null,
      is_verified: Boolean(input.isVerified),
    });
  }

  async createInsight(input: {
    researchJobId: string;
    insightType: string;
    title: string;
    summary: string;
    customerSegment?: string;
    topic?: string;
    frequencyCount?: number;
    confidence?: number | null;
  }) {
    if (!input.title.trim() || !input.summary.trim()) {
      throw new Error("Tên insight và nội dung phân tích là bắt buộc.");
    }
    return this.repo.createInsight({
      research_job_id: input.researchJobId,
      insight_type: input.insightType,
      title: input.title.trim(),
      summary: input.summary.trim(),
      customer_segment: input.customerSegment?.trim() || null,
      topic: input.topic?.trim() || null,
      frequency_count: input.frequencyCount ?? 0,
      confidence: input.confidence ?? null,
      verification_status: "unverified",
    });
  }

  async createOpportunity(input: {
    researchJobId: string;
    businessUnitId?: string | null;
    title: string;
    customerSegment?: string;
    problem: string;
    proposedSolution: string;
    evidenceSummary?: string;
    currentCapability?: string;
    capabilityGap?: string;
  }) {
    if (!input.title.trim() || !input.problem.trim() || !input.proposedSolution.trim()) {
      throw new Error("Tên cơ hội, vấn đề khách hàng và giải pháp đề xuất là bắt buộc.");
    }
    return this.repo.createOpportunity({
      research_job_id: input.researchJobId,
      business_unit_id: input.businessUnitId ?? null,
      title: input.title.trim(),
      customer_segment: input.customerSegment?.trim() || null,
      problem: input.problem.trim(),
      proposed_solution: input.proposedSolution.trim(),
      evidence_summary: input.evidenceSummary?.trim() || null,
      current_capability: input.currentCapability?.trim() || null,
      capability_gap: input.capabilityGap?.trim() || null,
      status: "needs_validation",
    });
  }

  async createMarketingStrategyDraft(input: {
    opportunityId: string;
    businessUnitId?: string | null;
    targetCustomer: string;
    positioning: string;
    valueProposition: string;
    marketingIdeas: string[];
    channelStrategy: string[];
    testHypotheses: string[];
    kpis: string[];
    assumptions: string[];
  }) {
    if (!input.opportunityId) throw new Error("Chưa chọn cơ hội.");
    const version = await this.repo.nextMarketingStrategyVersion(input.opportunityId);
    const strategy = await this.repo.createMarketingStrategy({
      opportunity_id: input.opportunityId,
      business_unit_id: input.businessUnitId ?? null,
      version,
      target_customer: input.targetCustomer.trim(),
      positioning: input.positioning.trim(),
      value_proposition: input.valueProposition.trim(),
      marketing_ideas: input.marketingIdeas,
      channel_strategy: input.channelStrategy,
      test_hypotheses: input.testHypotheses,
      kpis: input.kpis,
      assumptions: input.assumptions,
      risks: [],
      status: "needs_review",
      created_by_agent: "AI_MARKETING",
    });

    await this.activityLog.record({
      agent: "AI Marketing",
      unit: "Chiến lược Marketing",
      businessUnitId: input.businessUnitId ?? null,
      message:
        "Đã tạo một chiến lược marketing dạng giả thuyết. Chưa được coi là đúng cho đến khi test và có dữ liệu thực tế.",
      type: "action",
    });
    return strategy;
  }

  async captureSourceWithBrowser(sourceId: string): Promise<{ duplicate: boolean; evidenceId: string }> {
    const source = await this.repo.findSourceById(sourceId);
    if (!source) throw new Error("Không tìm thấy nguồn cần thu thập.");
    if (!source.url) throw new Error("Nguồn chưa có đường dẫn URL.");

    const run = await this.repo.createResearchRun({
      research_job_id: source.research_job_id,
      run_type: "browser",
      status: "running",
      input_snapshot: { source_id: source.id, url: source.url },
      started_at: new Date().toISOString(),
    });

    try {
      const capture = await capturePublicPage(source.url);
      const duplicate = await this.repo.findEvidenceByHash(source.id, capture.contentHash);
      const metadata = {
        ...objectValue(source.metadata),
        page_title: capture.pageTitle,
        html_length: capture.htmlLength,
        content_hash: capture.contentHash,
        last_capture_at: capture.capturedAt,
      };

      if (duplicate) {
        await this.repo.updateSource(source.id, {
          title: source.title ?? capture.pageTitle,
          capture_method: "browser",
          captured_at: capture.capturedAt,
          status: "captured",
          metadata,
        });
        await this.repo.updateResearchRun(run.id, {
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
        await this.repo.uploadScreenshot(screenshotPath, capture.screenshot);
      }

      const evidence = await this.repo.createEvidence({
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

      await this.repo.updateSource(source.id, {
        title: source.title ?? capture.pageTitle,
        capture_method: "browser",
        captured_at: capture.capturedAt,
        status: "captured",
        metadata,
      });

      await this.repo.updateResearchRun(run.id, {
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
        message: `Browser đã thu thập bằng chứng trực tiếp từ ${capture.url}.`,
        type: "action",
      });

      return { duplicate: false, evidenceId: evidence.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Lỗi Browser không xác định";
      await this.repo.updateSource(source.id, {
        status: "failed",
        metadata: {
          ...objectValue(source.metadata),
          last_capture_error: message,
          last_capture_at: new Date().toISOString(),
        },
      });
      await this.repo.updateResearchRun(run.id, {
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      });
      throw error;
    }
  }

  async analyzeResearchWithAi(researchJobId: string): Promise<{ insights: number; opportunities: number }> {
    const job = await this.repo.findResearchJobById(researchJobId);
    if (!job) throw new Error("Không tìm thấy công việc nghiên cứu.");

    const evidenceRows = await this.repo.findEvidenceForResearchJob(researchJobId);
    const usableEvidence = evidenceRows
      .filter((row: any) => typeof row.raw_text === "string" && row.raw_text.trim().length >= 50)
      .map((row: any) => ({
        id: row.id as string,
        text: row.raw_text as string,
        sourceUrl: (row.source_url as string | null) ?? null,
      }));

    if (usableEvidence.length === 0) {
      throw new Error("Chưa có bằng chứng đủ nội dung để AI phân tích.");
    }

    const run = await this.repo.createResearchRun({
      research_job_id: researchJobId,
      run_type: "ai_analysis",
      status: "running",
      input_snapshot: {
        evidence_count: usableEvidence.length,
        model: getCmiAiModel(),
      },
      started_at: new Date().toISOString(),
    });

    try {
      const analysis = await analyzeCmiEvidence({
        researchTitle: job.title,
        objective: job.objective,
        evidence: usableEvidence,
      });

      for (const insight of analysis.insights) {
        await this.repo.createInsight({
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
        await this.repo.createOpportunity({
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

      await this.repo.updateResearchRun(run.id, {
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
      await this.repo.updateResearchRun(run.id, {
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      });
      throw error;
    }
  }

  async approveOpportunityAndGenerateMarketing(input: {
    opportunityId: string;
    actorUserId: string;
  }) {
    const opportunity = await this.repo.findOpportunityById(input.opportunityId);
    if (!opportunity) throw new Error("Không tìm thấy cơ hội cần duyệt.");
    if (!["needs_validation", "approved_for_marketing"].includes(opportunity.status)) {
      throw new Error("Cơ hội hiện không ở trạng thái cho phép gửi sang AI Marketing.");
    }

    const approvedAt = new Date().toISOString();
    await this.repo.updateOpportunity(opportunity.id, {
      status: "approved_for_marketing",
      approved_by: input.actorUserId,
      approved_at: approvedAt,
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

    const version = await this.repo.nextMarketingStrategyVersion(opportunity.id);
    const strategy = await this.repo.createMarketingStrategy({
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
      message: `Đã tạo chiến lược Marketing V${version} cho cơ hội “${opportunity.title}”. Tất cả nội dung vẫn là giả thuyết cần test.`,
      type: "action",
    });

    return strategy;
  }
}
