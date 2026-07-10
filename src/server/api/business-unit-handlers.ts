import { NextResponse } from "next/server";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { buildContainer, getAdminContainer, getRequestContainer } from "@/server/container";
import { authenticateApiRequest, principalHasMinimumRole, principalLabel } from "@/server/auth/api-auth";
import type { TaskPriority } from "@/data/tasks";
import type { LogType } from "@/data/logs";

type CreateTaskPayload = {
  type: "task";
  title: string;
  owner?: string;
  priority?: TaskPriority;
  dueDate?: string;
};

type CreateApprovalPayload = {
  type: "approval";
  title: string;
  summary?: string;
  requestedBy?: string;
};

type CreateLogPayload = {
  type: "log";
  agent: string;
  message: string;
  logType?: LogType;
};

type CreatePayload = CreateTaskPayload | CreateApprovalPayload | CreateLogPayload;

/**
 * Builds the GET/POST handlers for a single business unit's REST namespace
 * (e.g. /api/hospitality). GET returns everything scoped to that unit; POST
 * lets a manager+ dashboard user, or an n8n service caller (x-api-key), push
 * a new task / approval / activity log into it.
 */
export function createBusinessUnitHandlers(slug: string, unitLabel: string) {
  async function GET(request: Request) {
    const principal = await authenticateApiRequest(request);
    if (!principal) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const container = await getRequestContainer();
    const businessUnit = await container.businessUnits.findBySlug(slug);
    if (!businessUnit) {
      return NextResponse.json({ error: "Business unit not configured" }, { status: 404 });
    }

    const [tasks, approvals, agents, properties, logs] = await Promise.all([
      container.tasks.listForBusinessUnit(businessUnit.id),
      container.approvals.listForBusinessUnit(businessUnit.id),
      container.agents.listForBusinessUnit(businessUnit.id),
      container.properties.listForBusinessUnit(businessUnit.id),
      container.activityLog.listForBusinessUnit(businessUnit.id),
    ]);

    return NextResponse.json({ businessUnit, tasks, approvals, agents, properties, logs });
  }

  async function POST(request: Request) {
    const principal = await authenticateApiRequest(request);
    if (!principal) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!principalHasMinimumRole(principal, "manager")) {
      return NextResponse.json({ error: "Forbidden — manager role or higher required" }, { status: 403 });
    }

    let payload: CreatePayload;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Service callers have no Supabase session, so RLS's authenticated-only
    // insert policies would reject them — fall back to the service-role
    // container for those; dashboard users keep going through RLS.
    const container =
      principal.kind === "service" ? getAdminContainer() : buildContainer(await createRequestClient());

    const businessUnit = await container.businessUnits.findBySlug(slug);
    if (!businessUnit) {
      return NextResponse.json({ error: "Business unit not configured" }, { status: 404 });
    }

    const actor = principalLabel(principal);

    try {
      if (payload.type === "task") {
        if (!payload.title) {
          return NextResponse.json({ error: "title is required" }, { status: 400 });
        }
        const task = await container.tasks.create(
          {
            title: payload.title,
            unit: unitLabel,
            owner: payload.owner ?? unitLabel,
            priority: payload.priority ?? "medium",
            dueDate: payload.dueDate ?? null,
            businessUnitId: businessUnit.id,
          },
          actor
        );
        return NextResponse.json({ task }, { status: 201 });
      }

      if (payload.type === "approval") {
        if (!payload.title) {
          return NextResponse.json({ error: "title is required" }, { status: 400 });
        }
        const approval = await container.approvals.create(
          {
            title: payload.title,
            summary: payload.summary ?? null,
            unit: unitLabel,
            requestedBy: payload.requestedBy ?? unitLabel,
            businessUnitId: businessUnit.id,
          },
          actor
        );
        return NextResponse.json({ approval }, { status: 201 });
      }

      if (payload.type === "log") {
        if (!payload.agent || !payload.message) {
          return NextResponse.json({ error: "agent and message are required" }, { status: 400 });
        }
        const log = await container.activityLog.record({
          agent: payload.agent,
          unit: unitLabel,
          businessUnitId: businessUnit.id,
          message: payload.message,
          type: payload.logType ?? "info",
        });
        return NextResponse.json({ log }, { status: 201 });
      }

      return NextResponse.json({ error: "type must be 'task', 'approval', or 'log'" }, { status: 400 });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 }
      );
    }
  }

  return { GET, POST };
}
