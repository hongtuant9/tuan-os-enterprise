"use server";

import { revalidatePath } from "next/cache";
import { getRequestContainer } from "@/server/container";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";
import type { CmiBusinessLine } from "@/data/cmi";
import { consumeCmiAiQuota } from "@/server/cmi/ai-quota";

const TPT_ANCHOR_URL = "https://www.teacherspayteachers.com/store/stem-in-the-middle";

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

async function requireManager() {
  const container = await getRequestContainer();
  const session = await getCurrentSession(container.db);
  if (!session || !hasMinimumRole(session.role, "manager")) {
    throw new Error("Chỉ Quản lý trở lên mới được chạy Browser hoặc AI CMI.");
  }
  return { container, session };
}

function guidedResearch(line: CmiBusinessLine): { title: string; objective: string; researchType: string } {
  if (line === "cozy_garden") {
    return {
      title: "Tìm cơ hội sản phẩm Cozy Garden từ đối thủ & khách hàng",
      objective:
        "Tìm 20–30 đối thủ cạnh tranh gần và tương đồng nhất tại Tam Cốc/Ninh Bình; thu thập sản phẩm, giá, hình ảnh, review, lời khen/phàn nàn, nhu cầu và marketing công khai để xác định nỗi đau lặp lại, khoảng trống thị trường và 5–10 cơ hội sản phẩm/dịch vụ khả thi cho Cozy Garden.",
      researchType: "mixed",
    };
  }
  if (line === "homestay") {
    return {
      title: "Tìm cơ hội sản phẩm Homestay từ OTA & đối thủ",
      objective:
        "Tìm 20–30 homestay/khách sạn cạnh tranh gần và tương đồng nhất tại Tam Cốc/Ninh Bình; phân tích phòng, giá, tiện ích, review OTA, breakfast, check-in, transfer, tour và dịch vụ bổ sung để tìm nỗi đau, nhu cầu và cơ hội sản phẩm/dịch vụ có thể bán cho khách quốc tế.",
      researchType: "mixed",
    };
  }
  if (line === "tpt_isteam") {
    return {
      title: "Tìm cơ hội sản phẩm TpT / iSTEAM từ seller dẫn đầu",
      objective:
        `Dùng STEM in the Middle (${TPT_ANCHOR_URL}) làm nguồn neo; tìm 20–30 seller tương đương về STEM, AI, Robotics và Computer Science. Phân tích từng nhóm sản phẩm, giá, grade, resource type, preview, review, lời khen/phàn nàn, bundle, positioning và funnel quan sát được để tìm nhu cầu giáo viên, khoảng trống thị trường và cơ hội sản phẩm số có nhu cầu cao.`,
      researchType: "mixed",
    };
  }
  return {
    title: "Nghiên cứu cơ hội sản phẩm liên mảng",
    objective: "Phân tích bằng chứng khách hàng, đối thủ và thị trường để xác định nhu cầu, nỗi đau, khoảng trống và cơ hội sản phẩm khả thi.",
    researchType: "mixed",
  };
}

export async function startCmiGuidedResearch(formData: FormData) {
  const { container, session } = await requireManager();
  const raw = text(formData, "businessLine");
  const line: CmiBusinessLine = ["cozy_garden", "homestay", "tpt_isteam", "cross_business"].includes(raw)
    ? (raw as CmiBusinessLine)
    : "cross_business";

  const dashboard = await container.cmi.dashboard();
  const existing = dashboard.researchJobs.find(
    (item) => item.businessLine === line && item.status !== "archived" && !item.title.trim().startsWith("[PILOT]")
  );
  if (existing) {
    revalidatePath("/intelligence/cmi");
    return;
  }

  const preset = guidedResearch(line);
  const created = await container.cmi.createResearchJob({
    ...preset,
    businessLine: line,
    businessUnitId: null,
    createdBy: session.userId,
  });

  if (line === "tpt_isteam" && created && typeof created === "object" && "id" in created) {
    const researchJobId = String((created as { id: unknown }).id);
    await container.cmi.createSource({
      researchJobId,
      platform: "Teachers Pay Teachers",
      sourceType: "web_page",
      url: TPT_ANCHOR_URL,
      title: "STEM in the Middle — nguồn neo TpT",
      competitorName: "STEM in the Middle",
    });
  }

  revalidatePath("/intelligence/cmi");
}

export async function discoverCmiCompetitors(formData: FormData) {
  const { container } = await requireManager();
  await container.cmiCompetitors.discover(text(formData, "researchJobId"));
  revalidatePath("/intelligence/cmi");
}

export async function selectCmiCompetitors(formData: FormData) {
  const { container } = await requireManager();
  const selectedIds = formData.getAll("competitorIds").map((value) => String(value));
  await container.cmiCompetitors.selectAndCreateSources({
    researchJobId: text(formData, "researchJobId"),
    selectedIds,
  });
  revalidatePath("/intelligence/cmi");
}

export async function enqueueCmiResearchSources(formData: FormData) {
  const { container } = await requireManager();
  await container.cmiCollectionQueue.enqueueResearch(text(formData, "researchJobId"));
  revalidatePath("/intelligence/cmi");
}

export async function captureCmiSourceBrowser(formData: FormData) {
  const { container } = await requireManager();
  await container.cmiAutomation.captureSource(text(formData, "sourceId"));
  revalidatePath("/intelligence/cmi");
}

export async function analyzeCmiResearchWithAi(formData: FormData) {
  const { container } = await requireManager();
  await consumeCmiAiQuota(container.db, "cmi_analysis");
  await container.cmiAutomation.analyzeResearch(text(formData, "researchJobId"));
  revalidatePath("/intelligence/cmi");
}

export async function approveCmiOpportunityForMarketing(formData: FormData) {
  const { container, session } = await requireManager();
  await consumeCmiAiQuota(container.db, "marketing_strategy");
  await container.cmiAutomation.approveOpportunityAndGenerateMarketing({
    opportunityId: text(formData, "opportunityId"),
    actorUserId: session.userId,
  });
  revalidatePath("/intelligence/cmi");
}
