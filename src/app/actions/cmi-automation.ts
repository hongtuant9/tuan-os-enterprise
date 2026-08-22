"use server";

import { revalidatePath } from "next/cache";
import { getRequestContainer } from "@/server/container";
import { getCurrentSession } from "@/server/auth/session";
import { hasMinimumRole } from "@/server/auth/roles";

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

export async function captureCmiSourceBrowser(formData: FormData) {
  const { container } = await requireManager();
  await container.cmiAutomation.captureSource(text(formData, "sourceId"));
  revalidatePath("/intelligence/cmi");
}

export async function analyzeCmiResearchWithAi(formData: FormData) {
  const { container } = await requireManager();
  await container.cmiAutomation.analyzeResearch(text(formData, "researchJobId"));
  revalidatePath("/intelligence/cmi");
}

export async function approveCmiOpportunityForMarketing(formData: FormData) {
  const { container, session } = await requireManager();
  await container.cmiAutomation.approveOpportunityAndGenerateMarketing({
    opportunityId: text(formData, "opportunityId"),
    actorUserId: session.userId,
  });
  revalidatePath("/intelligence/cmi");
}
