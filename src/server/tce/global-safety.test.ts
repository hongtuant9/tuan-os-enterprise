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
