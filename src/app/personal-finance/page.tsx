import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { TceWorkspaceShell } from "@/components/tce/TceShell";
import {
  importLegacyPersonalFinance,
  saveOwnerBusinessTransfer,
  savePersonalAccount,
  savePersonalAsset,
  savePersonalDebt,
  savePersonalTransaction,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;

function money(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n)
    ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n)
    : "—";
}

function fmtDate(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(d);
}

function latest(rows: Row[], field: string) {
  return rows.map((x) => String(x[field] ?? "")).filter(Boolean).sort().at(-1) || null;
}

function effectiveStatus(base: unknown, sourceUpdatedAt: unknown, currentMonth: string) {
  const value = String(base ?? "NEED_VERIFY");
  if (value !== "VERIFIED") return value;
  if (!sourceUpdatedAt) return "NEED_VERIFY";
  return String(sourceUpdatedAt).slice(0, 10) < currentMonth ? "STALE" : "VERIFIED";
}

function Status({ value }: { value: string }) {
  const label = value === "VERIFIED" ? "ĐÃ XÁC MINH" : value === "STALE" ? "DỮ LIỆU CŨ" : value === "HOLD" ? "TẠM DỪNG" : "CẦN XÁC MINH";
  const cls = value === "VERIFIED" ? "bg-emerald-50 text-emerald-700" : value === "STALE" ? "bg-orange-50 text-orange-700" : "bg-amber-50 text-amber-700";
  return <span className={"rounded-full px-2 py-1 text-[10px] font-bold " + cls}>{label}</span>;
}

function Card(props: {
  label: string; value: string; source: string; updatedAt?: unknown; sourceUpdatedAt?: unknown;
  status: string; updateHref: string;
}) {
  return <div className="rounded-xl border border-[#dce8f4] bg-white p-4 shadow-sm">
    <p className="text-[11px] font-semibold text-[#64799d]">{props.label}</p>
    <p className="mt-2 text-[24px] font-extrabold tracking-tight text-[#0b2455]">{props.value}</p>
    <div className="mt-3 flex flex-wrap items-center gap-2"><Status value={props.status} /><span className="text-[9px] text-[#8190a7]">Nguồn: {props.source}</span></div>
    <p className="mt-1 text-[9px] text-[#95a0b0]">App cập nhật: {fmtDate(props.updatedAt)} · Nguồn cập nhật: {fmtDate(props.sourceUpdatedAt)}</p>
    <div className="mt-2 flex gap-3 text-[10px] font-semibold"><a href="#data-source-map" className="text-[#1769d2] hover:underline">Xem nguồn</a><a href={props.updateHref} className="text-[#1769d2] hover:underline">Cập nhật dữ liệu</a></div>
  </div>;
}

const sourceMap = [
  ["Tài sản ròng","Personal/Family Finance","accounts + non-account assets + debts","owner_finance_position_v","Verified assets − verified liabilities; chỉ hiện khi coverage đủ","Tài khoản / Tài sản / Khoản nợ"],
  ["Tổng tài sản","Personal/Family Finance","personal_finance_accounts + personal_finance_assets","owner_finance_position_v","Không duplicate Cash/Bank/E-wallet trong assets","Tài khoản / Tài sản"],
  ["Tổng nợ","Personal/Family Finance","personal_finance_debts","owner_finance_position_v","SUM current_principal VERIFIED ACTIVE","Khoản nợ"],
  ["Tiền khả dụng","Personal/Family Finance","personal_finance_accounts","owner_finance_position_v","SUM balance VERIFIED + is_liquid","Tài khoản"],
  ["Thu nhập tháng","Personal + Business→Personal","personal_finance_transactions + owner_business_transfers","personal_finance_monthly_v","INCOME VERIFIED + transfer BUSINESS_TO_PERSONAL VERIFIED","Giao dịch / Business ↔ Personal"],
  ["Chi phí tháng","Personal/Family Finance","personal_finance_transactions","personal_finance_monthly_v","EXPENSE VERIFIED","Giao dịch"],
  ["Dòng tiền ròng tháng","Personal + Business→Personal","transactions + owner_business_transfers","personal_finance_monthly_v","Income − Expense − Debt payment ± owner transfer","Giao dịch / Business ↔ Personal"],
  ["Quỹ dự phòng","Personal/Family Finance","personal_finance_accounts","owner_finance_position_v","SUM account VERIFIED + is_emergency_fund","Tài khoản"],
  ["Dòng tiền cá nhân","Personal/Family Finance","personal_finance_transactions","direct query","Current-month transaction ledger","Giao dịch"],
  ["Business ↔ Personal","Bridge only","owner_business_transfers","direct query","Actual owner draw/distribution/contribution only; không copy P&L","Business ↔ Personal"],
  ["Nợ","Personal/Family Finance","personal_finance_debts","direct query","Current principal / rate / service / maturity","Khoản nợ"],
  ["Tài sản","Personal/Family Finance","accounts + personal_finance_assets","direct query","Account balances riêng; non-account assets riêng","Tài khoản / Tài sản"],
  ["Hành trình Tự do tài chính","Consolidated Owner View","views + personal_finance_goals","derived UI","Net worth → emergency fund → debt → cashflow → sustainable income → target","Các nguồn tương ứng"],
] as const;

function FormShell({ id, title, children, disabled }: { id: string; title: string; children: React.ReactNode; disabled: boolean }) {
  return <details id={id} className="rounded-xl border border-[#dce8f4] bg-white p-4">
    <summary className="cursor-pointer text-[13px] font-extrabold text-[#102456]">{title}</summary>
    {disabled ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-[11px] font-semibold text-amber-800">Database migration chưa PASS; form đang HOLD để tránh ghi vào cấu trúc chưa tồn tại.</p> : children}
  </details>;
}

const inputClass = "rounded-md border border-[#cbd8e8] px-2 py-2 text-[11px]";

export default async function PersonalFinancePage() {
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: profile } = await db.from("users").select("role").eq("id", auth.user.id).maybeSingle();
  if (profile?.role !== "owner") return <TceWorkspaceShell title="Tài chính cá nhân" subtitle="Khu vực riêng của chủ sở hữu" generatedAt={new Date().toISOString()}><div className="p-6"><div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">Bạn không có quyền truy cập dữ liệu Tài chính cá nhân.</div></div></TceWorkspaceShell>;

  const raw = db as unknown as SupabaseClient;
  const now = new Date();
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit" }).format(now) + "-01";

  const [positionRes, monthRes, debtsRes, assetsRes, accountsRes, goalsRes, txRes, transferRes, auditRes] = await Promise.all([
    raw.from("owner_finance_position_v").select("*").maybeSingle(),
    raw.from("personal_finance_monthly_v").select("*").eq("month", month).maybeSingle(),
    raw.from("personal_finance_debts").select("*").eq("status","ACTIVE").order("current_principal", { ascending: false }),
    raw.from("personal_finance_assets").select("*").eq("record_status","ACTIVE").order("value_amount", { ascending: false }),
    raw.from("personal_finance_accounts").select("*").order("current_balance", { ascending: false }),
    raw.from("personal_finance_goals").select("*").eq("status", "ACTIVE"),
    raw.from("personal_finance_transactions").select("*").eq("record_status","ACTIVE").gte("transaction_date", month).order("transaction_date", { ascending: false }).limit(100),
    raw.from("owner_business_transfers").select("*").eq("record_status","ACTIVE").gte("transfer_date", month).order("transfer_date", { ascending: false }).limit(100),
    raw.from("personal_finance_audit_log").select("metadata,created_at").eq("entity_type","IMPORT").order("created_at",{ascending:false}).limit(1).maybeSingle(),
  ]);

  const allResults = [positionRes, monthRes, debtsRes, assetsRes, accountsRes, goalsRes, txRes, transferRes];
  const migrationMissing = allResults.some((r) => r.error?.code === "42P01" || r.error?.code === "42703");
  const position = positionRes.data as Row | null;
  const monthly = monthRes.data as Row | null;
  const debts = (debtsRes.data ?? []) as Row[];
  const assets = (assetsRes.data ?? []) as Row[];
  const accounts = (accountsRes.data ?? []) as Row[];
  const goals = (goalsRes.data ?? []) as Row[];
  const transactions = (txRes.data ?? []) as Row[];
  const transfers = (transferRes.data ?? []) as Row[];

  const assetSourceAt = latest([...assets,...accounts],"source_updated_at");
  const debtSourceAt = latest(debts,"source_updated_at");
  const txSourceAt = monthly?.source_updated_at ?? latest(transactions,"source_updated_at");
  const accountUpdatedAt = latest(accounts,"updated_at");
  const debtUpdatedAt = latest(debts,"updated_at");
  const assetUpdatedAt = latest([...assets,...accounts],"updated_at");

  const totalAssetsReady = Number(position?.verified_asset_count ?? 0) + Number(position?.verified_account_count ?? 0) > 0
    && Number(position?.unverified_asset_count ?? 0) === 0 && Number(position?.unverified_account_count ?? 0) === 0;
  const debtReady = Number(position?.verified_debt_count ?? 0) > 0 && Number(position?.unverified_debt_count ?? 0) === 0;
  const cashReady = Number(position?.verified_account_count ?? 0) > 0 && Number(position?.unverified_account_count ?? 0) === 0;
  const emergencyReady = Number(position?.emergency_fund_account_count ?? 0) > 0 && cashReady;
  const netWorthReady = totalAssetsReady && Number(position?.unverified_debt_count ?? 0) === 0 && position?.net_worth !== null;

  const incomeReady = Number(monthly?.verified_income_count ?? 0) + Number(monthly?.verified_transfer_count ?? 0) > 0
    && Number(monthly?.unverified_income_count ?? 0) + Number(monthly?.unverified_transfer_count ?? 0) === 0;
  const expenseReady = Number(monthly?.verified_expense_count ?? 0) > 0 && Number(monthly?.unverified_expense_count ?? 0) === 0;
  const cashflowReady = Number(monthly?.verified_cashflow_count ?? 0) > 0 && Number(monthly?.unverified_cashflow_count ?? 0) === 0;

  const verifiedExpenses = transactions.filter((x) => x.transaction_type === "EXPENSE" && x.verification_status === "VERIFIED");
  const expenseCategories = ["Ăn uống","Giáo dục","Nhà ở","Đi lại","Y tế"] as const;
  const expenseSummary = [...expenseCategories,"Khác"].map((category) => ({
    category,
    amount: verifiedExpenses.filter((x) => category === "Khác" ? !expenseCategories.includes(String(x.category) as typeof expenseCategories[number]) : String(x.category) === category).reduce((s,x) => s + Number(x.amount ?? 0),0),
  }));

  const assetStatus = totalAssetsReady ? effectiveStatus("VERIFIED",assetSourceAt,month) : "NEED_VERIFY";
  const debtStatus = debtReady ? effectiveStatus("VERIFIED",debtSourceAt,month) : "NEED_VERIFY";
  const cashStatus = cashReady ? effectiveStatus("VERIFIED",latest(accounts,"source_updated_at"),month) : "NEED_VERIFY";
  const emergencyStatus = emergencyReady ? effectiveStatus("VERIFIED",latest(accounts.filter(x=>x.is_emergency_fund),"source_updated_at"),month) : "NEED_VERIFY";
  const incomeStatus = incomeReady ? effectiveStatus("VERIFIED",txSourceAt,month) : "NEED_VERIFY";
  const expenseStatus = expenseReady ? effectiveStatus("VERIFIED",txSourceAt,month) : "NEED_VERIFY";
  const cashflowStatus = cashflowReady ? effectiveStatus("VERIFIED",txSourceAt,month) : "NEED_VERIFY";
  const netWorthStatus = netWorthReady && assetStatus==="VERIFIED" && debtStatus==="VERIFIED" ? "VERIFIED" : netWorthReady ? "STALE" : "NEED_VERIFY";

  return <TceWorkspaceShell title="Tài chính cá nhân" subtitle="PERSONAL / FAMILY FINANCE · OWNER ONLY · Mỗi số đều có nguồn, cách cập nhật và trạng thái xác minh" generatedAt={new Date().toISOString()}>
    <div className="space-y-4 p-4 lg:p-5">
      {migrationMissing ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[12px] font-semibold text-amber-800">HOLD: Personal Finance production schema chưa đầy đủ. Không suy 0đ từ NO DATA và tạm khóa form ghi dữ liệu cho tới khi migration + RLS PASS.</div> : null}

      <section><h2 className="mb-3 text-[15px] font-extrabold text-[#102456]">1. Tổng quan</h2><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Tài sản ròng" value={netWorthStatus==="VERIFIED" ? money(position?.net_worth) : "—"} source="Owner Consolidated View" updatedAt={latest([...assets,...accounts,...debts],"updated_at")} sourceUpdatedAt={latest([...assets,...accounts,...debts],"source_updated_at")} status={netWorthStatus} updateHref="#input-account" />
        <Card label="Tổng tài sản" value={assetStatus==="VERIFIED" ? money(position?.verified_assets) : "—"} source="Tài khoản + tài sản không trùng lặp" updatedAt={assetUpdatedAt} sourceUpdatedAt={assetSourceAt} status={assetStatus} updateHref="#input-asset" />
        <Card label="Tổng nợ" value={debtStatus==="VERIFIED" ? money(position?.verified_liabilities) : "—"} source="Personal Finance · Nợ" updatedAt={debtUpdatedAt} sourceUpdatedAt={debtSourceAt} status={debtStatus} updateHref="#input-debt" />
        <Card label="Tiền khả dụng" value={cashStatus==="VERIFIED" ? money(position?.available_cash) : "—"} source="Tài khoản thanh khoản" updatedAt={accountUpdatedAt} sourceUpdatedAt={latest(accounts,"source_updated_at")} status={cashStatus} updateHref="#input-account" />
        <Card label="Thu nhập tháng" value={incomeStatus==="VERIFIED" ? money(monthly?.personal_income_actual) : "—"} source="Giao dịch + phân phối thực nhận" updatedAt={monthly?.last_updated_at} sourceUpdatedAt={monthly?.source_updated_at} status={incomeStatus} updateHref="#input-transaction" />
        <Card label="Chi phí tháng" value={expenseStatus==="VERIFIED" ? money(monthly?.personal_expense_actual) : "—"} source="Giao dịch cá nhân VERIFIED" updatedAt={monthly?.last_updated_at} sourceUpdatedAt={monthly?.source_updated_at} status={expenseStatus} updateHref="#input-transaction" />
        <Card label="Dòng tiền ròng tháng" value={cashflowStatus==="VERIFIED" ? money(monthly?.personal_net_cash_flow) : "—"} source="Personal + Business↔Personal" updatedAt={monthly?.last_updated_at} sourceUpdatedAt={monthly?.source_updated_at} status={cashflowStatus} updateHref="#input-transaction" />
        <Card label="Quỹ dự phòng" value={emergencyStatus==="VERIFIED" ? money(position?.emergency_fund) : "—"} source="Tài khoản được đánh dấu Quỹ dự phòng" updatedAt={accountUpdatedAt} sourceUpdatedAt={latest(accounts.filter(x=>x.is_emergency_fund),"source_updated_at")} status={emergencyStatus} updateHref="#input-account" />
      </div></section>

      <section id="data-source-map" className="rounded-xl border border-[#dce8f4] bg-white p-4">
        <h2 className="text-[14px] font-extrabold text-[#102456]">2. Bản đồ nguồn dữ liệu (Data Source Map)</h2>
        <p className="mt-1 text-[10px] text-[#7185a5]">Supabase là canonical runtime Personal Finance sau migration; Sheet gia đình là nguồn lịch sử/planning/evidence. FIN-HOSPITALITY-001 chỉ là Business Finance.</p>
        <div className="mt-3 overflow-x-auto"><table className="min-w-[1050px] w-full text-[10px]"><thead className="bg-[#f3f7fb] text-[#466084]"><tr>{["Metric","Authority","Bảng nguồn","View/query","Calculation","CEO cập nhật"].map(x=><th key={x} className="p-2 text-left">{x}</th>)}</tr></thead><tbody>
          {sourceMap.map((r)=><tr key={r[0]} className="border-t">{r.map((x,i)=><td key={i} className="p-2 align-top">{x}</td>)}</tr>)}
        </tbody></table></div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-[#dce8f4] bg-white p-4"><h2 className="text-[14px] font-extrabold text-[#102456]">3. Dòng tiền cá nhân</h2><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] text-[10px]"><thead className="bg-[#f3f7fb]"><tr><th className="p-2 text-left">Ngày</th><th>Loại</th><th>Danh mục</th><th className="text-right">Số tiền</th><th>Trạng thái</th><th>Nguồn</th></tr></thead><tbody>
          {transactions.length ? transactions.map((x,i)=><tr key={i} className="border-t"><td className="p-2">{String(x.transaction_date)}</td><td>{String(x.transaction_type)}</td><td>{String(x.category)}</td><td className="text-right">{money(x.amount)}</td><td className="text-center"><Status value={effectiveStatus(x.verification_status,x.source_updated_at,month)} /></td><td>{String(x.source)}</td></tr>) : <tr><td colSpan={6} className="p-6 text-center text-slate-500">NO DATA — chưa có giao dịch canonical tháng này.</td></tr>}
        </tbody></table></div></div>
        <div className="rounded-xl border border-[#dce8f4] bg-white p-4"><h2 className="text-[14px] font-extrabold text-[#102456]">4. Chi phí gia đình</h2><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{expenseSummary.map(x=><div key={x.category} className="rounded-lg bg-[#f5f9fd] p-3 text-[10px]"><div>{x.category}</div><b className="mt-1 block text-[14px]">{verifiedExpenses.length ? money(x.amount) : "—"}</b></div>)}</div></div>
      </section>

      <section className="rounded-xl border border-[#dce8f4] bg-white p-4"><h2 className="text-[14px] font-extrabold text-[#102456]">5. Business ↔ Personal</h2><p className="mt-1 text-[10px] text-[#7185a5]">Chỉ tiền/lợi ích kinh tế thực sự chuyển giữa doanh nghiệp và cá nhân. Doanh thu/P&L Hospitality không đi thẳng vào Personal Income.</p><div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">{transfers.length ? transfers.map((x,i)=><div key={i} className="rounded-lg border p-3 text-[10px]"><div className="flex justify-between"><b>{String(x.business_unit)}</b><Status value={effectiveStatus(x.verification_status,x.source_updated_at,month)} /></div><div className="mt-2">{String(x.transfer_type)} · {money(x.amount)} · {String(x.transfer_date)}</div><div className="mt-1 text-slate-500">{String(x.source)} · {String(x.source_reference ?? "—")}</div></div>) : <p className="text-[10px] text-slate-500">NO DATA — chưa có transfer canonical.</p>}</div></section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-[#dce8f4] bg-white p-4"><h2 className="text-[14px] font-extrabold text-[#102456]">6. Nợ</h2><div className="mt-3 space-y-2">{debts.length ? debts.map((x,i)=><div key={i} className="rounded-lg border p-3 text-[10px]"><div className="flex justify-between"><b>{String(x.name)}</b><Status value={effectiveStatus(x.verification_status,x.source_updated_at,month)} /></div><div className="mt-2">Dư gốc: {x.verification_status==="VERIFIED" ? money(x.current_principal) : "—"} · Đáo hạn: {String(x.maturity_date ?? "—")}</div><div className="mt-1 text-slate-500">Nguồn: {String(x.source)} · Source updated: {fmtDate(x.source_updated_at)}</div></div>) : <p className="text-[10px] text-slate-500">NO DATA — không đồng nghĩa Tổng nợ = 0.</p>}</div></div>
        <div className="rounded-xl border border-[#dce8f4] bg-white p-4"><h2 className="text-[14px] font-extrabold text-[#102456]">7. Tài sản & tài khoản</h2><div className="mt-3 space-y-2">{accounts.map((x,i)=><div key={"a"+i} className="rounded-lg border p-3 text-[10px]"><div className="flex justify-between"><b>{String(x.name)}</b><Status value={effectiveStatus(x.verification_status,x.source_updated_at,month)} /></div><div className="mt-2">{String(x.account_type)} · {x.verification_status==="VERIFIED" ? money(x.current_balance) : "—"}</div></div>)}{assets.map((x,i)=><div key={"v"+i} className="rounded-lg border p-3 text-[10px]"><div className="flex justify-between"><b>{String(x.name)}</b><Status value={effectiveStatus(x.verification_status,x.source_updated_at,month)} /></div><div className="mt-2">{String(x.asset_type)} · {String(x.valuation_kind)} · {x.verification_status==="VERIFIED" ? money(x.value_amount) : "—"}</div></div>)}{!accounts.length&&!assets.length?<p className="text-[10px] text-slate-500">NO DATA — không đồng nghĩa Tổng tài sản = 0.</p>:null}</div></div>
      </section>

      <section className="rounded-xl border border-[#dce8f4] bg-white p-4"><h2 className="text-[14px] font-extrabold text-[#102456]">8. Hành trình Tự do tài chính</h2><div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Tài sản ròng",netWorthStatus==="VERIFIED"?money(position?.net_worth):"—"],
          ["Quỹ dự phòng",emergencyStatus==="VERIFIED"?money(position?.emergency_fund):"—"],
          ["Giảm nợ",debtStatus==="VERIFIED"?money(position?.verified_liabilities):"—"],
          ["Dòng tiền dương",cashflowStatus==="VERIFIED"?money(monthly?.personal_net_cash_flow):"—"],
          ["Thu nhập bền vững","Theo dõi từ INCOME được đánh dấu bền vững"],
          ["Mục tiêu tự do tài chính",money(goals.find(x=>x.goal_type==="FINANCIAL_FREEDOM")?.target_amount)],
        ].map(([label,value],i)=><div key={label} className="rounded-lg bg-[#f5f9fd] p-3 text-center text-[10px]"><b>{i+1}. {label}</b><div className="mt-2 text-[#667b9b]">{value}</div></div>)}
      </div><p className="mt-3 text-[9px] text-[#8795aa]">Không có Financial Freedom Score. Chỉ dùng Actual VERIFIED/current; dữ liệu cũ hoặc thiếu evidence hiển thị — / CẦN XÁC MINH.</p></section>

      <section className="rounded-xl border border-[#dce8f4] bg-white p-4"><h2 className="text-[14px] font-extrabold text-[#102456]">9. Nhập / cập nhật dữ liệu</h2><p className="mt-1 text-[10px] text-[#7185a5]">CEO thao tác tại đây; không sửa database trực tiếp. Mọi bản ghi do App tạo mặc định NEED_VERIFY cho tới khi evidence được reconciliation.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <FormShell id="input-transaction" title="+ Giao dịch" disabled={migrationMissing}><form action={savePersonalTransaction} className="mt-3 grid grid-cols-2 gap-2"><input className={inputClass} name="transaction_date" type="date" required/><select className={inputClass} name="transaction_type"><option value="EXPENSE">Chi</option><option value="INCOME">Thu</option><option value="DEBT_PAYMENT">Trả nợ</option><option value="TRANSFER">Chuyển nội bộ</option></select><input className={inputClass} name="category" placeholder="Danh mục" required/><input className={inputClass} name="amount" inputMode="decimal" placeholder="Số tiền" required/><input className={inputClass+" col-span-2"} name="description" placeholder="Mô tả"/><input className={inputClass+" col-span-2"} name="evidence_reference" placeholder="Link/mã bằng chứng (nếu có)"/><label className="text-[10px]"><input type="checkbox" name="is_essential"/> Chi thiết yếu</label><label className="text-[10px]"><input type="checkbox" name="is_sustainable_income"/> Thu nhập bền vững</label><button className="col-span-2 rounded-md bg-[#1769d2] px-3 py-2 text-[11px] font-bold text-white">Lưu NEED_VERIFY</button></form></FormShell>

          <FormShell id="input-account" title="+ Tài khoản / cập nhật số dư" disabled={migrationMissing}><form action={savePersonalAccount} className="mt-3 grid grid-cols-2 gap-2"><select className={inputClass+" col-span-2"} name="record_id"><option value="">Tạo tài khoản mới</option>{accounts.map(x=><option key={String(x.id)} value={String(x.id)}>Cập nhật: {String(x.name)}</option>)}</select><input className={inputClass} name="name" placeholder="Tên tài khoản" required/><select className={inputClass} name="account_type"><option>CASH</option><option>BANK</option><option>E_WALLET</option><option>BUSINESS_DISTRIBUTION</option><option>OTHER</option></select><input className={inputClass} name="institution" placeholder="Ngân hàng/tổ chức"/><input className={inputClass} name="current_balance" placeholder="Số dư" required/><input className={inputClass} name="balance_as_of" type="date" required/><input className={inputClass} name="evidence_reference" placeholder="Sao kê/link bằng chứng"/><label className="text-[10px]"><input type="checkbox" name="is_liquid" defaultChecked/> Thanh khoản</label><label className="text-[10px]"><input type="checkbox" name="is_emergency_fund"/> Quỹ dự phòng</label><button className="col-span-2 rounded-md bg-[#1769d2] px-3 py-2 text-[11px] font-bold text-white">Lưu NEED_VERIFY</button></form></FormShell>

          <FormShell id="input-debt" title="+ Khoản nợ / cập nhật dư nợ" disabled={migrationMissing}><form action={savePersonalDebt} className="mt-3 grid grid-cols-2 gap-2"><select className={inputClass+" col-span-2"} name="record_id"><option value="">Tạo khoản nợ mới</option>{debts.map(x=><option key={String(x.id)} value={String(x.id)}>Cập nhật: {String(x.name)}</option>)}</select><input className={inputClass} name="name" placeholder="Tên khoản nợ" required/><select className={inputClass} name="debt_type"><option>BANK</option><option>OVERDRAFT</option><option>FAMILY</option><option>BUSINESS_PERSONAL_LIABILITY</option><option>OTHER</option></select><input className={inputClass} name="opening_principal" placeholder="Dư gốc ban đầu" required/><input className={inputClass} name="current_principal" placeholder="Dư gốc hiện tại" required/><input className={inputClass} name="interest_rate_annual" placeholder="Lãi suất năm (vd 0.06)"/><input className={inputClass} name="monthly_debt_service" placeholder="Nghĩa vụ/tháng"/><input className={inputClass} name="maturity_date" type="date"/><input className={inputClass} name="next_payment_date" type="date"/><input className={inputClass} name="as_of_date" type="date" required/><input className={inputClass} name="evidence_reference" placeholder="Sao kê/hợp đồng"/><button className="col-span-2 rounded-md bg-[#1769d2] px-3 py-2 text-[11px] font-bold text-white">Lưu NEED_VERIFY</button></form></FormShell>

          <FormShell id="input-asset" title="+ Tài sản / cập nhật giá trị" disabled={migrationMissing}><form action={savePersonalAsset} className="mt-3 grid grid-cols-2 gap-2"><select className={inputClass+" col-span-2"} name="record_id"><option value="">Tạo tài sản mới</option>{assets.map(x=><option key={String(x.id)} value={String(x.id)}>Cập nhật: {String(x.name)}</option>)}</select><input className={inputClass} name="name" placeholder="Tên tài sản" required/><select className={inputClass} name="asset_type"><option>LIQUID</option><option>NON_LIQUID</option><option>BUSINESS_RELATED</option><option>OTHER</option></select><input className={inputClass} name="value_amount" placeholder="Giá trị" required/><select className={inputClass} name="valuation_kind"><option value="ESTIMATED">ESTIMATED</option><option value="VERIFIED">VERIFIED VALUE evidence pending</option><option value="UNKNOWN">UNKNOWN</option></select><input className={inputClass} name="as_of_date" type="date" required/><input className={inputClass} name="evidence_reference" placeholder="Chứng thư/link bằng chứng"/><button className="col-span-2 rounded-md bg-[#1769d2] px-3 py-2 text-[11px] font-bold text-white">Lưu NEED_VERIFY</button></form></FormShell>

          <FormShell id="input-transfer" title="+ Business ↔ Personal transfer" disabled={migrationMissing}><form action={saveOwnerBusinessTransfer} className="mt-3 grid grid-cols-2 gap-2"><input className={inputClass} name="transfer_date" type="date" required/><select className={inputClass} name="business_unit"><option>LAVENDER</option><option>RUBY</option><option>COZY_GARDEN</option><option>HOSPITALITY_SHARED</option><option>OTHER</option></select><select className={inputClass} name="direction"><option>BUSINESS_TO_PERSONAL</option><option>PERSONAL_TO_BUSINESS</option></select><select className={inputClass} name="transfer_type"><option>OWNER_DISTRIBUTION</option><option>OWNER_DRAW</option><option>SALARY_COMPENSATION</option><option>OWNER_CONTRIBUTION</option><option>PERSONAL_PAID_BUSINESS</option><option>BUSINESS_PAID_PERSONAL</option><option>OTHER</option></select><input className={inputClass} name="amount" placeholder="Số tiền" required/><input className={inputClass} name="evidence_reference" placeholder="Bằng chứng giao dịch" required/><button className="col-span-2 rounded-md bg-[#1769d2] px-3 py-2 text-[11px] font-bold text-white">Lưu NEED_VERIFY</button></form></FormShell>

          <FormShell id="import-history" title="Import dữ liệu lịch sử từ Sheet" disabled={migrationMissing}><form action={importLegacyPersonalFinance} className="mt-3"><p className="text-[10px] text-[#64799d]">Đọc 04_GiaoDich + baseline nợ/quỹ từ workbook gia đình; import idempotent và mặc định NEED_VERIFY. Phân phối Hospitality có conflict sẽ không tự VERIFIED.</p><button className="mt-3 rounded-md bg-[#102456] px-3 py-2 text-[11px] font-bold text-white">Audit + Import lịch sử</button>{auditRes.data ? <pre className="mt-3 overflow-auto rounded-lg bg-slate-50 p-3 text-[9px]">{JSON.stringify(auditRes.data.metadata,null,2)}</pre>:null}</form></FormShell>
        </div>
      </section>
    </div>
  </TceWorkspaceShell>;
}
