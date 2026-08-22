import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { CmiAutomationService } from "@/server/cmi/automation.service";

type QueryResult = { data: unknown; error: unknown };
type QueryBuilder = PromiseLike<QueryResult> & {
  select(columns: string): QueryBuilder;
  insert(input: Record<string, unknown>): QueryBuilder;
  update(input: Record<string, unknown>): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  order(column: string, options: { ascending: boolean }): QueryBuilder;
};
type DbAdapter = {
  from(name: string): QueryBuilder;
  rpc(name: string, args: Record<string, unknown>): Promise<QueryResult>;
};

type SourceRow = {
  id: string;
  research_job_id: string;
  status: string;
};

type QueueRow = {
  id: string;
  research_job_id: string;
  source_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
};

function rows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export type CmiQueueSummary = {
  queued: number;
  running: number;
  completed: number;
  failed: number;
};

export class CmiCollectionQueueService {
  private readonly adapter: DbAdapter;

  constructor(
    db: SupabaseClient<Database>,
    private readonly automation: CmiAutomationService
  ) {
    this.adapter = db as unknown as DbAdapter;
  }

  private table(name: string): QueryBuilder {
    return this.adapter.from(name);
  }

  async enqueueResearch(researchJobId: string): Promise<{ enqueued: number; totalSources: number }> {
    const sourceResult = await this.table("cmi_sources")
      .select("id,research_job_id,status")
      .eq("research_job_id", researchJobId)
      .order("created_at", { ascending: true });
    if (sourceResult.error) throw sourceResult.error;
    const sources = rows<SourceRow>(sourceResult.data);
    if (sources.length === 0) throw new Error("Nghiên cứu chưa có nguồn để thu thập.");

    const queueResult = await this.table("cmi_collection_queue")
      .select("source_id,status")
      .eq("research_job_id", researchJobId)
      .order("created_at", { ascending: true });
    if (queueResult.error) throw queueResult.error;
    const existingIds = new Set(rows<{ source_id: string }>(queueResult.data).map((item) => item.source_id));

    let enqueued = 0;
    for (const source of sources) {
      if (existingIds.has(source.id) || source.status === "captured") continue;
      const { error } = await this.table("cmi_collection_queue").insert({
        research_job_id: researchJobId,
        source_id: source.id,
        status: "queued",
        attempts: 0,
        max_attempts: 3,
        next_attempt_at: new Date().toISOString(),
      });
      if (error) throw error;
      enqueued += 1;
    }

    return { enqueued, totalSources: sources.length };
  }

  async summary(researchJobId?: string): Promise<CmiQueueSummary> {
    let query = this.table("cmi_collection_queue").select("status");
    if (researchJobId) query = query.eq("research_job_id", researchJobId);
    const result = await query;
    if (result.error) throw result.error;
    const statuses = rows<{ status: string }>(result.data);
    return {
      queued: statuses.filter((x) => x.status === "queued").length,
      running: statuses.filter((x) => x.status === "running").length,
      completed: statuses.filter((x) => x.status === "completed").length,
      failed: statuses.filter((x) => x.status === "failed").length,
    };
  }

  async processBatch(limit = 1): Promise<Array<{ sourceId: string; status: string; error?: string }>> {
    const safeLimit = Math.min(2, Math.max(1, Math.round(limit)));
    const claim = await this.adapter.rpc("claim_cmi_collection_jobs", { p_limit: safeLimit });
    if (claim.error) throw claim.error;
    const jobs = rows<QueueRow>(claim.data);
    const results: Array<{ sourceId: string; status: string; error?: string }> = [];

    for (const job of jobs) {
      try {
        await this.automation.captureSource(job.source_id);
        const { error } = await this.table("cmi_collection_queue")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", job.id);
        if (error) throw error;
        results.push({ sourceId: job.source_id, status: "completed" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Lỗi Browser không xác định";
        const exhausted = job.attempts >= job.max_attempts;
        const backoffMinutes = Math.min(30, Math.max(1, job.attempts * 2));
        const { error: updateError } = await this.table("cmi_collection_queue")
          .update({
            status: exhausted ? "failed" : "queued",
            last_error: message.slice(0, 1000),
            next_attempt_at: new Date(Date.now() + backoffMinutes * 60_000).toISOString(),
            completed_at: exhausted ? new Date().toISOString() : null,
          })
          .eq("id", job.id);
        if (updateError) throw updateError;
        results.push({ sourceId: job.source_id, status: exhausted ? "failed" : "queued", error: message });
      }
    }

    return results;
  }
}
