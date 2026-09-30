import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root=process.cwd();
const read=(p:string)=>fs.readFileSync(path.join(root,p),"utf8");

test("critical TCE routes and navigation remain present",()=>{
  const shell=read("src/components/tce/TceShell.tsx");
  for(const route of ["/ai-le-tan","/business","/marketing","/finance","/personal-finance"]){
    assert.match(shell,new RegExp(`href: \"${route.replaceAll("/","\\/")}\"`));
    assert.equal(fs.existsSync(path.join(root,"src/app",route.slice(1),"page.tsx")),true,`missing ${route}`);
  }
});

test("AI Receptionist freshness is scoped without changing global shell contract",()=>{
  const screen=read("src/components/tce/ReferenceScreens.tsx");
  const shell=read("src/components/tce/TceShell.tsx");
  assert.match(screen,/DataFreshnessBar/);
  assert.doesNotMatch(shell,/DataFreshnessBar/);
});

test("AI Receptionist route remains dynamic and canonical-data backed",()=>{
  const page=read("src/app/ai-le-tan/page.tsx");
  assert.match(page,/dynamic = \"force-dynamic\"/);
  assert.match(page,/getTceTabLiveData\(\"reception\"/);
  assert.doesNotMatch(page,/static snapshot|mock data/i);
});


test("global engineering guardrail is canonical in execution governance",()=>{
  const governance=read("src/server/agents/execution-governance.ts");
  assert.match(governance,/TCE GLOBAL UI & DATA SAFETY STANDARD applies: current-data-first; preserve all non-target modules; regression = 0\./);
  assert.match(governance,/RULE-01 DATA FRESHNESS & LAST UPDATED/);
  assert.match(governance,/RULE-02 SCOPED CHANGE & NON-REGRESSION/);
  for(const item of ["Source of Truth đã đọc","Target scope đã xác định","Non-target modules đã xác định","Baseline snapshot tồn tại","Approval requirement đã xác định"]){
    assert.match(governance,new RegExp(item));
  }
});


test("Business route exposes scoped current-data freshness without static snapshot",()=>{
  const page=read("src/app/business/page.tsx");
  const data=read("src/server/tce/tab-live-data.ts");
  assert.match(page,/dynamic = "force-dynamic"/);
  assert.match(page,/getTceTabLiveData\("business"/);
  assert.match(data,/businessFreshness/);
  assert.match(data,/KiotViet Hotel \+ F&B · direct authenticated API read \+ Property runtime/);
  assert.match(data,/Không đọc được đầy đủ nguồn KiotViet trực tiếp ở lần tải này\. Không dùng 0 để thay dữ liệu lỗi\./);
});


test("verification fallback helper stays server-safe",()=>{
  const desktop=read("src/components/tce/ReferenceScreens.tsx");
  const mobile=read("src/components/tce/MobileMockup.tsx");
  const client=read("src/components/tce/VerificationHelp.tsx");
  const helper=read("src/components/tce/verification-guide.ts");
  assert.match(desktop,/verification-guide/);
  assert.match(mobile,/verification-guide/);
  assert.doesNotMatch(desktop,/fallbackVerificationGuide.*VerificationHelp/);
  assert.doesNotMatch(mobile,/fallbackVerificationGuide.*VerificationHelp/);
  assert.doesNotMatch(client,/export function fallbackVerificationGuide/);
  assert.match(helper,/export function fallbackVerificationGuide/);
  assert.doesNotMatch(helper,/use client/);
});


test("recovered runtime tabs expose source-specific freshness metadata",()=>{
  const data=read("src/server/tce/tab-live-data.ts");
  for(const token of ["financeFreshness","marketingFreshness","operationsFreshness","customerFreshness","hrFreshness","reportsFreshness"]){
    assert.match(data,new RegExp(token));
  }
  assert.match(data,/TASK-001 sync \+ KiotViet Hotel direct runtime/);
  assert.match(data,/Hospitality CRM canonical profiles \+ AI Receptionist runtime/);
  assert.match(data,/Activity Log \+ Sync Source Registry \+ TASK\/APPROVAL runtime/);
  assert.match(data,/Finance Actual chưa đủ coverage\/reconciliation/);
});

test("Business route returns before Finance-only slow dependencies",()=>{
  const live=read("src/server/tce/tab-live-data.ts");
  const business=live.indexOf('if (screen === "business")');
  const financeOnly=live.indexOf('const [hotelCashflow, fnbCashflow, hotelFinanceBot, fnbFinanceBot, debtSnapshot, cutoverSnapshot]');
  assert.ok(business>0,"business branch missing");
  assert.ok(financeOnly>business,"Finance-only dependencies must be fetched after Business early return");
  const businessBlock=live.slice(business,financeOnly);
  assert.doesNotMatch(businessBlock,/fetchHotelCashflowActual|fetchFnbCashflowActual|readFinanceBotSummary|readHospitalityDebtSnapshot|readFinanceCutoverSnapshot/);
});


test("Business current-month view reuses the same KiotViet reads",()=>{
  const live=read("src/server/tce/tab-live-data.ts");
  assert.match(live,/const sameAsCurrentMonth = period\.from === monthStart && period\.to === today/);
  assert.match(live,/const hotelMonthPromise = sameAsCurrentMonth\s*\? hotelPeriodPromise/);
  assert.match(live,/const fnbMonthPromise = sameAsCurrentMonth\s*\? fnbPeriodPromise/);
});


test("production deploy stamps Next deployment identity from git SHA",()=>{
  const config=read("next.config.mjs");
  const docker=read("Dockerfile");
  const deploy=read("scripts/deploy-tce-15-agents-vps.sh");
  assert.match(config,/deploymentId: process\.env\.NEXT_DEPLOYMENT_ID \|\| undefined/);
  assert.match(docker,/ARG NEXT_DEPLOYMENT_ID/);
  assert.match(docker,/ENV NEXT_DEPLOYMENT_ID=\$NEXT_DEPLOYMENT_ID/);
  assert.match(deploy,/--build-arg NEXT_DEPLOYMENT_ID="\$SHA"/);
});


test("Executive overview uses Revenue verification and Finance Foundation readiness without cashflow dependency",()=>{
  const page=read("src/app/page.tsx");
  const dashboard=read("src/components/ExecutiveDashboardLive.tsx");
  assert.doesNotMatch(page,/fetchHotelCashflowActual|fetchFnbCashflowActual|summarizeCashflow/);
  assert.match(page,/readFinanceFoundationReadiness/);
  assert.match(page,/Expense Actual coverage/);
  assert.match(page,/const revenueVerified/);
  assert.match(dashboard,/DataFreshnessBar/);
  assert.match(dashboard,/props\.revenue\.verified \? money\(props\.revenue\.total\) : "CẦN XÁC MINH"/);
});


test("Business verification guide does not ask to redo completed sold-SKU mapping",()=>{
  const live=read("src/server/tce/tab-live-data.ts");
  assert.match(live,/Sold-SKU mapping PASS/);
  assert.match(live,/matchedSoldSkuCount === foundationReadiness\.cogs\.soldSkuCount/);
  assert.doesNotMatch(live,/steps: \["Đóng sold-SKU mapping\."/);
});

test("finance route heavy reads are bounded and fail closed",()=>{
  const live=read("src/server/tce/tab-live-data.ts");
  assert.match(live,/FINANCE_SOURCE_TIMEOUT_MS\s*=\s*6_000/);
  assert.match(live,/financeReadWithTimeout\(fetchHotelCashflowActual/);
  assert.match(live,/financeReadWithTimeout\(fetchFnbCashflowActual/);
  assert.match(live,/financeReadWithTimeout\(readHospitalityDebtSnapshot/);
  assert.match(live,/Finance source read exceeded bounded timeout or failed/);
});


test("verification card exposes in-place Data Gap Register fields",()=>{
  const modal=read("src/components/tce/VerificationHelp.tsx");
  const type=read("src/components/tce/verification-guide.ts");
  for(const label of ["Thiếu gì / cần xác minh gì?","Nguồn authority","Evidence hiện có","Blocker hiện tại","Next action","Khi nào được VERIFIED?"]) assert.match(modal,new RegExp(label.replace(/[?]/g,"\\?")));
  assert.match(type,/currentEvidence\?: string\[\]/);
  assert.match(type,/blocker\?: string/);
});


test("TCE tab loader fails closed instead of taking the whole route down",()=>{
  const loader=read("src/server/tce/tab-live-data.ts");
  assert.match(loader,/getTceTabLiveDataUnsafe/);
  assert.match(loader,/screen=\$\{screen\} fail-closed/);
  assert.match(loader,/freshnessStatus: \"ERROR\"/);
  assert.match(loader,/dataRecencyStatus: \"NO_DATA\"/);
  assert.match(loader,/không suy NO DATA thành 0/);
});
