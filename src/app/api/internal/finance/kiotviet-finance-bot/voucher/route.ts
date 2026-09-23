import { NextResponse } from "next/server";
import { authenticateApiRequest, principalHasMinimumRole, principalLabel } from "@/server/auth/api-auth";
import { getAdminContainer } from "@/server/container";
import {
  createFinanceVoucher,
  type FinanceBotSystem,
  type FinanceVoucherInput,
} from "@/server/integrations/kiotviet/finance-browser-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validSystem(value: unknown): value is FinanceBotSystem {
  return value === "FNB" || value === "HOTEL";
}

export async function POST(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal || principal.kind !== "user" || !principalHasMinimumRole(principal, "owner")) {
    return NextResponse.json({ error: "Owner session required for financial mutation." }, { status: principal ? 403 : 401 });
  }

  const body = await request.json().catch(() => null) as Partial<FinanceVoucherInput> | null;
  if (!body || !validSystem(body.system) || !["THU", "CHI"].includes(body.direction || "") ||
      typeof body.groupCode !== "string" || typeof body.amount !== "number" ||
      !["Tiền mặt", "Ngân hàng", "Ví điện tử"].includes(body.paymentMethod || "") ||
      typeof body.note !== "string" || typeof body.idempotencyKey !== "string") {
    return NextResponse.json({ error: "Invalid voucher payload." }, { status: 400 });
  }

  const input = body as FinanceVoucherInput;
  const result = await createFinanceVoucher(input);
  const container = getAdminContainer();
  await container.activityLog.record({
    agent: "TCE KiotViet Finance Bot v1",
    unit: "Finance",
    type: result.ok ? "action" : "alert",
    message: `KiotViet ${input.system} ${input.direction} key=${input.idempotencyKey} state=${result.state} readback=${result.readBackVerified} requested_by=${principalLabel(principal)}`,
  }).catch(() => undefined);

  return NextResponse.json(result, {
    status: result.ok ? 200 : result.state === "UNKNOWN_AFTER_WRITE" ? 409 : 422,
    headers: { "Cache-Control": "no-store" },
  });
}
