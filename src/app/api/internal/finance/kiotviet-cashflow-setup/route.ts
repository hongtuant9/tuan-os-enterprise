import { NextResponse } from "next/server";
import { authenticateApiRequest, principalHasMinimumRole } from "@/server/auth/api-auth";
import {
  cashflowGroupDisplayName,
  cashflowGroupsFor,
  type KiotVietCashflowSystem,
} from "@/server/integrations/kiotviet/cashflow-taxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serialize(system: KiotVietCashflowSystem) {
  return cashflowGroupsFor(system).map((group) => ({
    code: group.code,
    name: cashflowGroupDisplayName(group),
    direction: group.direction,
    usedForFinancialReporting:
      group.financialReporting === "CO"
        ? true
        : group.financialReporting === "KHONG"
          ? false
          : null,
    staffUse: group.staffUse,
    rule: group.rule,
  }));
}

async function authorize(request: Request) {
  const principal = await authenticateApiRequest(request);
  if (!principal) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!principalHasMinimumRole(principal, "admin")) {
    return { error: NextResponse.json({ error: "Forbidden — admin role or higher required" }, { status: 403 }) };
  }
  return { principal };
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  return NextResponse.json({
    ok: true,
    mode: "KIOTVIET_ONLY",
    setup: {
      fnb: serialize("F&B"),
      hotel: serialize("Hotel"),
    },
    providerCapability: {
      readCashflow: {
        retailPublicApi: "GET /cashflow is documented for Retail only",
        fnbPublicApi: "HOLD_UNSUPPORTED",
        hotelPublicApi: "HOLD_UNSUPPORTED",
      },
      cashflowGroupCrud: {
        fnbPublicApi: "HOLD_UNSUPPORTED",
        hotelPublicApi: "HOLD_UNSUPPORTED",
        safePolicy: "Do not call undocumented/private KiotViet endpoints.",
      },
    },
    transactionPolicy: {
      externalFallback: false,
      parallelTceEntry: false,
      staffEntrySystem: "KiotViet F&B or KiotViet Hotel only",
    },
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  return NextResponse.json({
    ok: false,
    code: "KIOTVIET_CASHFLOW_GROUP_WRITE_UNSUPPORTED",
    state: "HOLD_PROVIDER_API",
    message: "KiotViet Public API hiện không công bố endpoint tạo/sửa Loại thu/Loại chi cho F&B hoặc Hotel. Không có write nào được thực hiện.",
    nextRequiredEvidence: "Official KiotViet endpoint + request schema + credential scope for cashflow group CRUD.",
  }, { status: 409 });
}
