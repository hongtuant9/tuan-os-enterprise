import type { CmiDashboard } from "@/data/cmi";
import { CmiRepository } from "@/server/repositories/cmi.repository";
import { ActivityLogService } from "@/server/services/activity-log.service";

function n(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
        createdAt: r.created_at,
      })),
      evidence: evidence.map((r: any) => ({
        id: r.id,
        sourceId: r.source_id,
        evidenceType: r.evidence_type,
        rawText: r.raw_text,
        screenshotPath: r.screenshot_path,
        sourceUrl: r.source_url,
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
        browserConnected: false,
        aiAnalysisConnected: false,
        note:
          "V0.1 đang ở chế độ thử nghiệm có kiểm soát. Browser tự động và mô hình AI chưa được nối vào production; dữ liệu phải có bằng chứng nguồn trước khi kết luận.",
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
    const strategy = await this.repo.createMarketingStrategy({
      opportunity_id: input.opportunityId,
      business_unit_id: input.businessUnitId ?? null,
      version: 1,
      target_customer: input.targetCustomer.trim(),
      positioning: input.positioning.trim(),
      value_proposition: input.valueProposition.trim(),
      marketing_ideas: input.marketingIdeas,
      channel_strategy: input.channelStrategy,
      test_hypotheses: input.testHypotheses,
      kpis: input.kpis,
      assumptions: input.assumptions,
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
}
