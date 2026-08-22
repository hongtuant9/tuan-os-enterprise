"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";
import { getRequestContainer } from "@/server/container";
import {
  isCmiAiProviderConfigured,
  setCmiAiRuntimeEnabled,
} from "@/server/cmi/ai-runtime";
import type { CmiBusinessLine } from "@/data/cmi";

const TPT_ANCHOR_URL = "https://www.teacherspayteachers.com/store/stem-in-the-middle";

async function requireManager() {
  const container = await getRequestContainer();
  const session = await getCurrentSession(container.db);
  if (!session || !hasMinimumRole(session.role, "manager")) {
    throw new Error("Chỉ Quản lý trở lên mới được thay đổi chế độ AI CMI.");
  }
  return { container, session };
}

function preset(line: CmiBusinessLine) {
  if (line === "cozy_garden") {
    return {
      title: "Tìm cơ hội sản phẩm Cozy Garden từ đối thủ & khách hàng",
      objective: "Tìm 20–30 đối thủ cạnh tranh gần và tương đồng nhất tại Tam Cốc/Ninh Bình; thu thập sản phẩm, giá, hình ảnh, review, lời khen/phàn nàn, nhu cầu và marketing công khai để xác định nỗi đau lặp lại, khoảng trống thị trường và 5–10 cơ hội sản phẩm/dịch vụ khả thi cho Cozy Garden.",
    };
  }
  if (line === "homestay") {
    return {
      title: "Tìm cơ hội sản phẩm Homestay từ OTA & đối thủ",
      objective: "Tìm 20–30 homestay/khách sạn cạnh tranh gần và tương đồng nhất tại Tam Cốc/Ninh Bình; phân tích phòng, giá, tiện ích, review OTA, breakfast, check-in, transfer, tour và dịch vụ bổ sung để tìm nỗi đau, nhu cầu và cơ hội sản phẩm/dịch vụ có thể bán cho khách quốc tế.",
    };
  }
  return {
    title: "Tìm cơ hội sản phẩm TpT / iSTEAM từ seller dẫn đầu",
    objective: `Dùng STEM in the Middle (${TPT_ANCHOR_URL}) làm nguồn neo; tìm 20–30 seller tương đương về STEM, AI, Robotics và Computer Science. Phân tích từng nhóm sản phẩm, giá, grade, resource type, preview, review, lời khen/phàn nàn, bundle, positioning và funnel quan sát được để tìm nhu cầu giáo viên, khoảng trống thị trường và cơ hội sản phẩm số có nhu cầu cao.`,
  };
}

export async function setCmiPaidAiMode(formData: FormData) {
  const { session } = await requireManager();
  const enabled = String(formData.get("enabled") ?? "false") === "true";
  if (enabled && !isCmiAiProviderConfigured()) {
    throw new Error("Chưa có OPENAI_API_KEY trên production. Hãy thiết lập secret trong Coolify trước khi bật AI có phí.");
  }
  await setCmiAiRuntimeEnabled(enabled, session.userId);
  revalidatePath("/intelligence/cmi");
}

export async function discoverAllThreeBusinessLines() {
  const { container, session } = await requireManager();
  if (!isCmiAiProviderConfigured()) {
    throw new Error("Chưa có OPENAI_API_KEY trên production. Không gọi API.");
  }

  const lines: CmiBusinessLine[] = ["cozy_garden", "homestay", "tpt_isteam"];
  let dashboard = await container.cmi.dashboard();

  for (const line of lines) {
    let job = dashboard.researchJobs.find(
      (item) => item.businessLine === line && !item.title.trim().startsWith("[PILOT]")
    );
    if (!job) {
      const info = preset(line);
      const created = await container.cmi.createResearchJob({
        title: info.title,
        objective: info.objective,
        researchType: "mixed",
        businessLine: line,
        businessUnitId: null,
        createdBy: session.userId,
      });
      const id = created && typeof created === "object" && "id" in created
        ? String((created as { id: unknown }).id)
        : "";
      if (!id) throw new Error(`Không tạo được nghiên cứu cho ${line}.`);
      if (line === "tpt_isteam") {
        await container.cmi.createSource({
          researchJobId: id,
          platform: "Teachers Pay Teachers",
          sourceType: "web_page",
          url: TPT_ANCHOR_URL,
          title: "STEM in the Middle — nguồn neo TpT",
          competitorName: "STEM in the Middle",
        });
      }
      dashboard = await container.cmi.dashboard();
      job = dashboard.researchJobs.find((item) => item.id === id);
    }
    if (!job) continue;

    const existing = dashboard.competitors.some((item) => item.researchJobId === job?.id);
    if (!existing) {
      await container.cmiCompetitors.discover(job.id);
      dashboard = await container.cmi.dashboard();
    }
  }

  revalidatePath("/intelligence/cmi");
}
