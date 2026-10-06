import { NextResponse } from "next/server";
import { financeBotConfigStatus, readFinanceBotSummary } from "@/server/integrations/kiotviet/finance-browser-bot";
import { aggregateCashflowHealth, cashflowBrowserHealth } from "@/server/integrations/kiotviet/cashflow-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const [fnbSnapshot, hotelSnapshot] = await Promise.all([
    readFinanceBotSummary("FNB"),
    readFinanceBotSummary("HOTEL"),
  ]);
  const fnbConfig = financeBotConfigStatus("FNB");
  const hotelConfig = financeBotConfigStatus("HOTEL");

  const fnb = cashflowBrowserHealth(fnbSnapshot, {
    enabled: fnbConfig.enabled,
    webConfigured: fnbConfig.retailerConfigured && fnbConfig.usernameConfigured && fnbConfig.passwordConfigured,
  });
  const hotel = cashflowBrowserHealth(hotelSnapshot, {
    enabled: hotelConfig.enabled,
    webConfigured: hotelConfig.retailerConfigured && hotelConfig.usernameConfigured && hotelConfig.passwordConfigured,
  });

  return NextResponse.json({
    status: aggregateCashflowHealth(fnb, hotel),
    checkedAt: new Date().toISOString(),
    kiotVietCashflow: {
      fnb,
      hotel,
      transactionWriteEnabled: false,
      sourcePolicy: "CHEAPEST_RELIABLE_SOURCE_FIRST",
    },
  }, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
