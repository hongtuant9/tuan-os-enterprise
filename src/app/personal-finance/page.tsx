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
  saveFinanceMasterData,
  setFinanceMasterDataActive,
  voidPersonalRecord,
} from "./actions";
import { MasterDataSelect } from "./MasterDataSelect";
import { TransactionMasterFields } from "./TransactionMasterFields";
import { ConfirmSubmitButton } from "./ConfirmSubmitButton";
import { PersonalFinanceOperatingDashboard } from "./PersonalFinanceOperatingDashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;

function currentMonthInHoChiMinh() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "10";
  return `${year}-${month}-01`;
}

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

const inputClass = "w-full rounded-md border border-[#9fb4cf] bg-white px-2 py-2 text-[11px] text-[#183252] placeholder:text-[#6b7f9b] disabled:bg-[#edf2f7] disabled:text-[#75869f] focus:border-[#1769d2] focus:outline-none";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function PersonalFinancePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const editType = firstParam(params.editType);
  const editId = firstParam(params.editId);
  const listQuery = firstParam(params.q).trim().toLocaleLowerCase("vi");
  const listStatus = firstParam(params.status).trim();
  const requestedMonth = firstParam(params.month).trim();
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: profile } = await db.from("users").select("role").eq("id", auth.user.id).maybeSingle();
  if (profile?.role !== "owner") return <TceWorkspaceShell title="Tài chính cá nhân" subtitle="Khu vực riêng của chủ sở hữu" generatedAt={new Date().toISOString()}><div className="p-6"><div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">Bạn không có quyền truy cập dữ liệu Tài chính cá nhân.</div></div></TceWorkspaceShell>;

  const raw = db as unknown as SupabaseClient;
  const month = /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth + "-01" : currentMonthInHoChiMinh();
  const snapshotStartDate = new Date(month + "T00:00:00Z"); snapshotStartDate.setUTCMonth(snapshotStartDate.getUTCMonth()-11);
  const snapshotStart = snapshotStartDate.toISOString().slice(0,10);

  const [positionRes, monthRes, debtsRes, assetsRes, accountsRes, goalsRes, txRes, transferRes, auditRes, masterRes, historyTxRes, historyAccountRes, historyDebtRes, historyAssetRes, historyTransferRes, snapshotsRes, cutoverRes, operatingRes, businessCashAccountsRes, otaReceivedCurrentRes] = await Promise.all([
    raw.from("owner_finance_position_v").select("*").maybeSingle(),
    raw.from("personal_finance_monthly_v").select("*").eq("month", month).maybeSingle(),
    raw.from("personal_finance_debts").select("*").eq("status","ACTIVE").order("current_principal", { ascending: false }),
    raw.from("personal_finance_assets").select("*").eq("record_status","ACTIVE").order("value_amount", { ascending: false }),
    raw.from("personal_finance_accounts").select("*").eq("record_status","ACTIVE").order("current_balance", { ascending: false }),
    raw.from("personal_finance_goals").select("*").eq("status", "ACTIVE"),
    raw.from("personal_finance_transactions").select("*").eq("record_status","ACTIVE").gte("transaction_date", month).order("transaction_date", { ascending: false }).limit(100),
    raw.from("owner_business_transfers").select("*").eq("record_status","ACTIVE").gte("transfer_date", month).order("transfer_date", { ascending: false }).limit(100),
    raw.from("personal_finance_audit_log").select("metadata,created_at").eq("entity_type","IMPORT").order("created_at",{ascending:false}).limit(1).maybeSingle(),
    raw.from("finance_master_data").select("*").order("master_data_type").order("display_order").order("name"),
    raw.from("personal_finance_transactions").select("*").order("transaction_date", { ascending: false }).limit(500),
    raw.from("personal_finance_accounts").select("*").order("updated_at", { ascending: false }).limit(500),
    raw.from("personal_finance_debts").select("*").order("updated_at", { ascending: false }).limit(500),
    raw.from("personal_finance_assets").select("*").order("updated_at", { ascending: false }).limit(500),
    raw.from("owner_business_transfers").select("*").order("transfer_date", { ascending: false }).limit(500),
    raw.from("personal_finance_kpi_snapshots").select("*").gte("period",snapshotStart).order("period",{ascending:true}),
    raw.rpc("finance_cutover_snapshot"),
    raw.rpc("finance_operating_snapshot", { p_month: month }),
    raw.from("finance_accounts").select("account_code,display_name,business_unit,current_balance,balance_as_of,verification_status,reconciliation_status").in("account_code", ["CASH-COZY","CASH-LAVENDER","CASH-RUBY"]).eq("record_status","ACTIVE").order("account_code"),
    raw.from("finance_opening_positions").select("position_code,cutover_date,amount,verification_status,source,record_status,notes").eq("position_code","OTA-RECEIVED-CURRENT-20261005").eq("record_status","ACTIVE").maybeSingle(),
  ]);

  const allResults = [positionRes, monthRes, debtsRes, assetsRes, accountsRes, goalsRes, txRes, transferRes, masterRes, snapshotsRes, cutoverRes, operatingRes, businessCashAccountsRes, otaReceivedCurrentRes];
  const migrationMissing = allResults.some((r) => r.error?.code === "42P01" || r.error?.code === "42703");
  const position = positionRes.data as Row | null;
  const monthly = monthRes.data as Row | null;
  const debts = (debtsRes.data ?? []) as Row[];
  const assets = (assetsRes.data ?? []) as Row[];
  const accounts = (accountsRes.data ?? []) as Row[];
  const goals = (goalsRes.data ?? []) as Row[];
  const transactions = (txRes.data ?? []) as Row[];
  const transfers = (transferRes.data ?? []) as Row[];
  const masterData = (masterRes.data ?? []) as Row[];
  const historyTransactions = (historyTxRes.data ?? []) as Row[];
  const historyAccounts = (historyAccountRes.data ?? []) as Row[];
  const historyDebts = (historyDebtRes.data ?? []) as Row[];
  const historyAssets = (historyAssetRes.data ?? []) as Row[];
  const historyTransfers = (historyTransferRes.data ?? []) as Row[];
  const snapshots = (snapshotsRes.data ?? []) as Row[];
  const operating = operatingRes.data && typeof operatingRes.data === "object" && !Array.isArray(operatingRes.data) ? operatingRes.data as Row : null;
  const businessCashAccounts = (businessCashAccountsRes.data ?? []) as Row[];
  const otaReceivedCurrent = otaReceivedCurrentRes.data as Row | null;
  const activeMaster = (type: string) => masterData
    .filter((x) => x.master_data_type === type && x.is_active === true && x.record_status === "ACTIVE")
    .map((x) => ({ code: String(x.code), name: String(x.name) }));
  const transactionTypes = activeMaster("TRANSACTION_TYPE");
  const expenseCategories = activeMaster("EXPENSE_CATEGORY");
  const incomeCategories = activeMaster("INCOME_CATEGORY");
  const accountTypes = activeMaster("ACCOUNT_TYPE");
  const institutions = activeMaster("INSTITUTION");
  const debtTypes = activeMaster("DEBT_TYPE");
  const assetTypes = activeMaster("ASSET_TYPE");
  const paymentMethods = activeMaster("PAYMENT_METHOD");
  const incomeSources = activeMaster("INCOME_SOURCE");

  const editTransaction = editType === "transaction" ? historyTransactions.find((x)=>String(x.id)===editId) ?? null : null;
  const editAccount = editType === "account" ? historyAccounts.find((x)=>String(x.id)===editId) ?? null : null;
  const editDebt = editType === "debt" ? historyDebts.find((x)=>String(x.id)===editId) ?? null : null;
  const editAsset = editType === "asset" ? historyAssets.find((x)=>String(x.id)===editId) ?? null : null;
  const editTransfer = editType === "transfer" ? historyTransfers.find((x)=>String(x.id)===editId) ?? null : null;
  const editMaster = editType === "master" ? masterData.find((x)=>String(x.id)===editId) ?? null : null;

  const matchesList = (row: Row) => {
    const haystack = Object.values(row).map((v)=>String(v ?? "")).join(" ").toLocaleLowerCase("vi");
    const status = String(row.record_status ?? row.status ?? row.verification_status ?? "ACTIVE");
    return (!listQuery || haystack.includes(listQuery)) && (!listStatus || listStatus === "ALL" || status === listStatus);
  };
  const filteredTransactions = historyTransactions.filter(matchesList);
  const filteredAccounts = historyAccounts.filter(matchesList);
  const filteredDebts = historyDebts.filter(matchesList);
  const filteredAssets = historyAssets.filter(matchesList);
  const filteredTransfers = historyTransfers.filter(matchesList);

  const verifiedExpenses = transactions.filter((x) => x.transaction_type === "EXPENSE" && x.verification_status === "VERIFIED");
  const expenseSummary = expenseCategories.slice(0, 8).map((category) => ({
    category: category.name,
    amount: verifiedExpenses.filter((x) => String(x.category_code ?? "") === category.code).reduce((s,x) => s + Number(x.amount ?? 0),0),
  }));

  return <TceWorkspaceShell title="Tài chính cá nhân" subtitle="Theo dõi tiền thực tế, tiền trên sổ và tiến độ Tự do tài chính." generatedAt={new Date().toISOString()} headerVariant="personal-finance">
    <div className="space-y-4 p-4 text-[#17233d] [color-scheme:light] lg:p-5">
      <section className="flex flex-col gap-3 rounded-xl border border-[#dce8f4] bg-white p-4 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#6d83a3]">Kỳ theo dõi</div><div className="mt-1 text-[13px] font-extrabold text-[#102456]">Tài chính cá nhân theo tháng</div><p className="mt-1 text-[10px] text-[#7185a5]">Chọn tháng để xem Actual, P&L, dòng tiền và sức khỏe tài chính tại thời điểm cần kiểm tra.</p></div>
        <form method="get" className="flex items-center gap-2"><input type="month" name="month" defaultValue={month.slice(0,7)} className="rounded-lg border border-[#b7c9dd] bg-white px-3 py-2 text-[11px] font-bold text-[#183252]"/><button className="rounded-lg bg-[#0874eb] px-4 py-2 text-[11px] font-bold text-white">Xem kỳ</button></form>
      </section>
      {migrationMissing ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[12px] font-semibold text-amber-800">HOLD: Personal Finance production schema chưa đầy đủ. Không suy 0đ từ NO DATA và tạm khóa form ghi dữ liệu cho tới khi migration + RLS PASS.</div> : null}

      <PersonalFinanceOperatingDashboard
        month={month}
        operating={operating}
        position={position}
        monthly={monthly}
        goals={goals}
        snapshots={snapshots}
        transactions={transactions}
        historyTransactions={historyTransactions}
        debts={debts}
        personalAccounts={accounts}
        businessCashAccounts={businessCashAccounts}
        otaReceivedCurrent={otaReceivedCurrent}
        migrationMissing={migrationMissing}
      />

      <section id="data-source-map" className="rounded-xl border border-[#dce8f4] bg-white p-4">
        <h2 className="text-[14px] font-extrabold text-[#102456]">2. Bản đồ nguồn dữ liệu (Data Source Map)</h2>
        <p className="mt-1 text-[10px] text-[#7185a5]">Supabase là canonical runtime Personal Finance sau migration; Sheet gia đình là nguồn lịch sử/planning/evidence. FIN-HOSPITALITY-001 chỉ là Business Finance.</p>
        <div className="mt-3 overflow-x-auto"><table className="min-w-[1050px] w-full text-[10px] text-[#17233d]"><thead className="bg-[#f3f7fb] text-[#294567]"><tr>{["Metric","Authority","Bảng nguồn","View/query","Calculation","CEO cập nhật"].map(x=><th key={x} className="p-2 text-left font-bold">{x}</th>)}</tr></thead><tbody className="text-[#17233d]">
          {sourceMap.map((r)=><tr key={r[0]} className="border-t border-[#dce8f4] bg-white text-[#17233d]">{r.map((x,i)=><td key={i} className="p-2 align-top text-[#17233d]">{x}</td>)}</tr>)}
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

            <section id="data-list" className="rounded-xl border border-[#dce8f4] bg-white p-4">
        <h2 className="text-[14px] font-extrabold text-[#102456]">Chi tiết dữ liệu & thao tác an toàn</h2>
        <p className="mt-1 text-[10px] text-[#445b7d]">Không hard delete. Giao dịch/transfer dùng Hủy; account/asset/debt dùng Ngừng sử dụng/HOLD. Mọi thao tác ghi lý do và audit before/after.</p>
        <form className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_auto]" action="/personal-finance">
          <input className={inputClass} name="q" defaultValue={firstParam(params.q)} placeholder="Tìm theo tên, ngày, danh mục, số tiền..."/>
          <select className={inputClass} name="status" defaultValue={listStatus || "ALL"}><option value="ALL">Tất cả trạng thái</option><option value="ACTIVE">ACTIVE</option><option value="NEED_VERIFY">NEED_VERIFY</option><option value="VERIFIED">VERIFIED</option><option value="HOLD">HOLD</option><option value="VOIDED">VOIDED</option><option value="INACTIVE">INACTIVE</option></select>
          <button className="rounded-md bg-[#294b77] px-3 py-2 text-[11px] font-bold text-white">Lọc / tìm</button>
        </form>
        <div className="mt-3 space-y-3">
          {[["personal_finance_transactions","Giao dịch",filteredTransactions,"transaction_date","amount"],["personal_finance_accounts","Tài khoản",filteredAccounts,"name","current_balance"],["personal_finance_debts","Khoản nợ",filteredDebts,"name","current_principal"],["personal_finance_assets","Tài sản",filteredAssets,"name","value_amount"],["owner_business_transfers","Business ↔ Personal",filteredTransfers,"transfer_date","amount"]].map(([table,label,rows,labelKey,amountKey])=><details key={String(table)} className="rounded-lg border border-[#dce8f4] p-3">
            <summary className="cursor-pointer text-[11px] font-bold text-[#17345f]">{String(label)} · {(rows as Row[]).length} bản ghi</summary>
            <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[650px] text-[10px] text-[#243b5f]"><thead className="bg-[#eaf2fb] text-[#17345f]"><tr><th className="p-2 text-left">Bản ghi</th><th className="p-2 text-right">Số tiền</th><th className="p-2">Trạng thái</th><th className="p-2">Cập nhật</th><th className="p-2">Hành động</th></tr></thead><tbody>
              {(rows as Row[]).map((x)=><tr key={String(x.id)} className="border-t border-[#e4ecf5]"><td className="p-2">{String(x[labelKey as string] ?? x.category ?? x.name ?? x.id)}</td><td className="p-2 text-right">{money(x[amountKey as string])}</td><td className="p-2 text-center">{String(x.record_status ?? x.status ?? "ACTIVE")}</td><td className="p-2">{fmtDate(x.updated_at)}</td><td className="p-2"><form action={voidPersonalRecord} className="flex gap-1"><input type="hidden" name="table" value={String(table)}/><input type="hidden" name="record_id" value={String(x.id)}/><input className={inputClass} name="reason" placeholder="Lý do hủy/ngừng" required/><ConfirmSubmitButton className="rounded bg-[#8a2d2d] px-2 py-1 font-bold text-white" label={String(table).includes("transactions")||String(table).includes("transfers")?"Hủy giao dịch":"Ngừng sử dụng"} message={`Bạn có chắc muốn hủy/ngừng sử dụng bản ghi này?\nBản ghi: ${String(x[labelKey as string] ?? x.category ?? x.name ?? x.id)}\nSố tiền: ${money(x[amountKey as string])}\nNgày: ${fmtDate(x.transaction_date ?? x.transfer_date ?? x.as_of_date ?? x.balance_as_of)}\nTác động: bản ghi sẽ không còn tham gia Actual active nhưng vẫn được giữ trong lịch sử và audit trail.`}/></form><a className="ml-2 font-bold text-[#1769d2] hover:underline" href={String(table)==="personal_finance_transactions"?`/personal-finance?editType=transaction&editId=${String(x.id)}#input-transaction`:String(table)==="personal_finance_accounts"?`/personal-finance?editType=account&editId=${String(x.id)}#input-account`:String(table)==="personal_finance_debts"?`/personal-finance?editType=debt&editId=${String(x.id)}#input-debt`:String(table)==="personal_finance_assets"?`/personal-finance?editType=asset&editId=${String(x.id)}#input-asset`:`/personal-finance?editType=transfer&editId=${String(x.id)}#input-transfer`}>Sửa</a></td></tr>)}
            </tbody></table></div>
          </details>)}
        </div>
      </section>

      <section id="master-data-settings" className="rounded-xl border border-[#c9d9ec] bg-white p-4 text-[#1f3657]">
        <h2 className="text-[14px] font-extrabold text-[#102456]">10. Cài đặt danh mục</h2>
        <p className="mt-1 text-[10px] text-[#445b7d]">Supabase Master Data là canonical runtime. Không xóa cứng taxonomy đã dùng; tắt bằng INACTIVE. Code kỹ thuật được giữ trong database, UI hiển thị tên tiếng Việt.</p>
        {migrationMissing ? <p className="mt-3 rounded bg-amber-50 p-3 text-[10px] font-semibold text-amber-800">HOLD tới khi migration Master Data + RLS PASS.</p> : <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <form action={saveFinanceMasterData} className="grid grid-cols-2 gap-2 rounded-lg bg-[#f6f9fd] p-3">
            <input type="hidden" name="record_id" value={editMaster ? String(editMaster.id) : ""}/>
            {editMaster ? <div className="col-span-2 rounded bg-blue-50 p-2 text-[10px] font-semibold text-blue-800">Đang sửa: {String(editMaster.name)} · {String(editMaster.code)} <a href="/personal-finance#master-data-settings" className="ml-2 underline">Hủy sửa</a></div> : null}
            <select className={inputClass} name="master_data_type" defaultValue={editMaster ? String(editMaster.master_data_type) : "EXPENSE_CATEGORY"} required>{["EXPENSE_CATEGORY","INCOME_CATEGORY","INSTITUTION","PAYMENT_METHOD","INCOME_SOURCE","TRANSACTION_SOURCE"].map(x=><option key={x}>{x}</option>)}</select>
            <input className={inputClass} name="code" defaultValue={editMaster ? String(editMaster.code) : ""} placeholder="Mã canonical" required/>
            <input className={inputClass+" col-span-2"} name="name" defaultValue={editMaster ? String(editMaster.name) : ""} placeholder="Tên hiển thị tiếng Việt" required/>
            <select className={inputClass} name="parent_code" defaultValue={editMaster ? String(editMaster.parent_code ?? "") : ""}>
              <option value="">Không có danh mục cha</option>
              {[...expenseCategories,...incomeCategories].filter((x)=>!editMaster || x.code !== String(editMaster.code)).map((x)=><option key={x.code} value={x.code}>{x.name}</option>)}
            </select>
            <input className={inputClass} name="display_order" type="number" defaultValue={editMaster ? String(editMaster.display_order ?? 100) : "100"}/>
            <input className={inputClass+" col-span-2"} name="source_reference" defaultValue={editMaster ? String(editMaster.source_reference ?? "") : ""} placeholder="Nguồn / evidence"/>
            <label className="text-[10px] text-[#233b61]"><input type="checkbox" name="is_active" defaultChecked={editMaster ? editMaster.is_active === true : true}/> Đang sử dụng</label>
            <button className="rounded bg-[#1769d2] px-3 py-2 text-[11px] font-bold text-white">{editMaster ? "Lưu thay đổi danh mục" : "Thêm danh mục"}</button>
          </form>
          <div className="max-h-[420px] overflow-auto rounded-lg border border-[#dce8f4]">
            <table className="w-full text-[10px] text-[#243b5f]"><thead className="sticky top-0 bg-[#dfeaf7] text-[#102456]"><tr><th className="p-2 text-left">Loại</th><th className="p-2 text-left">Tên</th><th className="p-2">TT</th><th className="p-2">Bật/tắt</th></tr></thead><tbody>
              {masterData.map((x)=><tr key={String(x.id)} className="border-t border-[#dce8f4]"><td className="p-2">{String(x.master_data_type)}</td><td className="p-2"><b>{String(x.name)}</b><div className="text-[#6a7e9b]">{String(x.code)}</div></td><td className="p-2 text-center">{String(x.record_status)}</td><td className="p-2"><a className="mr-2 font-bold text-[#1769d2] underline" href={`/personal-finance?editType=master&editId=${String(x.id)}#master-data-settings`}>Sửa</a><form action={setFinanceMasterDataActive} className="inline-flex gap-1"><input type="hidden" name="record_id" value={String(x.id)}/><input type="hidden" name="is_active" value={x.is_active?"":"1"}/><input className={inputClass} name="reason" placeholder="Lý do" required/><ConfirmSubmitButton className="rounded bg-[#294b77] px-2 py-1 font-bold text-white" label={x.is_active?"Tắt":"Bật"} message={x.is_active?"Ngừng sử dụng danh mục này? Bản ghi cũ vẫn được giữ nguyên.":"Kích hoạt lại danh mục này?"}/></form></td></tr>)}
            </tbody></table>
          </div>
        </div>}
      </section>

      <section className="rounded-xl border border-[#dce8f4] bg-white p-4"><h2 className="text-[14px] font-extrabold text-[#102456]">11. Nhập / cập nhật dữ liệu</h2><p className="mt-1 text-[10px] text-[#7185a5]">CEO thao tác tại đây; không sửa database trực tiếp. Mọi bản ghi do App tạo mặc định NEED_VERIFY cho tới khi evidence được reconciliation.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <FormShell id="input-transaction" title="+ Giao dịch" disabled={migrationMissing}><form action={savePersonalTransaction} className="mt-3 grid grid-cols-2 gap-2">
            <input type="hidden" name="record_id" value={editTransaction ? String(editTransaction.id) : ""}/>
            {editTransaction ? <div className="col-span-2 rounded bg-blue-50 p-2 text-[10px] font-semibold text-blue-800">Đang sửa giao dịch {String(editTransaction.transaction_date)} · {String(editTransaction.category)}. Sau khi lưu sẽ chuyển về NEED_VERIFY. <a href="/personal-finance#input-transaction" className="underline">Hủy sửa</a></div> : null}
            <input className={inputClass} name="transaction_date" type="date" defaultValue={editTransaction ? String(editTransaction.transaction_date) : ""} required/>
            <TransactionMasterFields transactionTypes={transactionTypes} expenseCategories={expenseCategories} incomeCategories={incomeCategories} className={inputClass} defaultType={editTransaction ? String(editTransaction.transaction_type) : "EXPENSE"} defaultCategory={editTransaction ? String(editTransaction.category_code ?? "") : ""}/>
            <select className={inputClass} name="account_id" defaultValue={editTransaction ? String(editTransaction.account_id ?? "") : ""}><option value="">Chọn tài khoản nếu áp dụng</option>{accounts.filter(x=>x.record_status==="ACTIVE").map(x=><option key={String(x.id)} value={String(x.id)}>{String(x.name)}</option>)}</select>
            <input className={inputClass} name="amount" inputMode="decimal" defaultValue={editTransaction ? String(editTransaction.amount ?? "") : ""} placeholder="Số tiền > 0" required/>
            <MasterDataSelect name="payment_method_code" options={paymentMethods} defaultValue={editTransaction ? String(editTransaction.payment_method_code ?? "") : ""} placeholder="Phương thức thanh toán (nếu áp dụng)" className={inputClass}/>
            <MasterDataSelect name="income_source_code" options={incomeSources} defaultValue={editTransaction ? String(editTransaction.income_source_code ?? "") : ""} placeholder="Nguồn thu nhập (nếu áp dụng)" className={inputClass}/>
            <input className={inputClass+" col-span-2"} name="description" defaultValue={editTransaction ? String(editTransaction.description ?? "") : ""} placeholder="Mô tả"/>
            <input className={inputClass+" col-span-2"} name="evidence_reference" defaultValue={editTransaction ? String(editTransaction.source_reference ?? "") : ""} placeholder="Link/mã bằng chứng"/>
            <label className="text-[10px] text-[#233b61]"><input type="checkbox" name="is_essential" defaultChecked={editTransaction?.is_essential === true}/> Chi thiết yếu</label>
            <label className="text-[10px] text-[#233b61]"><input type="checkbox" name="is_sustainable_income" defaultChecked={editTransaction?.is_sustainable_income === true}/> Thu nhập bền vững</label>
            <button className="col-span-2 rounded-md bg-[#1769d2] px-3 py-2 text-[11px] font-bold text-white">{editTransaction ? "Lưu sửa đổi → NEED_VERIFY" : "Lưu mới → NEED_VERIFY"}</button>
          </form></FormShell>

          <FormShell id="input-account" title="+ Tài khoản / cập nhật số dư" disabled={migrationMissing}><form action={savePersonalAccount} className="mt-3 grid grid-cols-2 gap-2"><input type="hidden" name="record_id" value={editAccount ? String(editAccount.id) : ""}/>{editAccount ? <div className="col-span-2 rounded bg-blue-50 p-2 text-[10px] font-semibold text-blue-800">Đang sửa: {String(editAccount.name)}. <a href="/personal-finance#input-account" className="underline">Hủy sửa</a></div> : null}<input className={inputClass} name="name" defaultValue={editAccount ? String(editAccount.name) : ""} placeholder="Tên tài khoản" required/><MasterDataSelect name="account_type_code" options={accountTypes} defaultValue={editAccount ? String(editAccount.account_type_code ?? "") : ""} required placeholder="Loại tài khoản" className={inputClass}/><MasterDataSelect name="institution_code" options={institutions} defaultValue={editAccount ? String(editAccount.institution_code ?? "") : ""} placeholder="Ngân hàng/tổ chức" className={inputClass}/><input className={inputClass} name="current_balance" defaultValue={editAccount ? String(editAccount.current_balance ?? "") : ""} placeholder="Số dư" required/><input className={inputClass} name="balance_as_of" type="date" defaultValue={editAccount ? String(editAccount.balance_as_of ?? "") : ""} required/><input className={inputClass} name="evidence_reference" defaultValue={editAccount ? String(editAccount.source_reference ?? "") : ""} placeholder="Sao kê/link bằng chứng"/><label className="text-[10px] text-[#233b61]"><input type="checkbox" name="is_liquid" defaultChecked={editAccount ? editAccount.is_liquid === true : true}/> Thanh khoản</label><label className="text-[10px] text-[#233b61]"><input type="checkbox" name="is_emergency_fund" defaultChecked={editAccount?.is_emergency_fund === true}/> Quỹ dự phòng</label><button className="col-span-2 rounded-md bg-[#1769d2] px-3 py-2 text-[11px] font-bold text-white">{editAccount ? "Lưu sửa đổi → NEED_VERIFY" : "Lưu mới → NEED_VERIFY"}</button></form></FormShell>

          <FormShell id="input-debt" title="+ Khoản nợ / cập nhật dư nợ" disabled={migrationMissing}><form action={savePersonalDebt} className="mt-3 grid grid-cols-2 gap-2"><input type="hidden" name="record_id" value={editDebt ? String(editDebt.id) : ""}/>{editDebt ? <div className="col-span-2 rounded bg-blue-50 p-2 text-[10px] font-semibold text-blue-800">Đang sửa: {String(editDebt.name)}. <a href="/personal-finance#input-debt" className="underline">Hủy sửa</a></div> : null}<input className={inputClass} name="name" defaultValue={editDebt ? String(editDebt.name) : ""} placeholder="Tên khoản nợ" required/><MasterDataSelect name="debt_type_code" options={debtTypes} defaultValue={editDebt ? String(editDebt.debt_type_code ?? "") : ""} required placeholder="Loại nợ" className={inputClass}/><MasterDataSelect name="lender_institution_code" options={institutions} defaultValue={editDebt ? String(editDebt.lender_institution_code ?? "") : ""} placeholder="Tổ chức cho vay" className={inputClass}/><input className={inputClass} name="opening_principal" defaultValue={editDebt ? String(editDebt.opening_principal ?? "") : ""} placeholder="Dư gốc ban đầu" required/><input className={inputClass} name="current_principal" defaultValue={editDebt ? String(editDebt.current_principal ?? "") : ""} placeholder="Dư gốc hiện tại" required/><input className={inputClass} name="interest_rate_annual" defaultValue={editDebt ? String(editDebt.interest_rate_annual ?? "") : ""} placeholder="Lãi suất năm (vd 0.06)"/><input className={inputClass} name="monthly_debt_service" defaultValue={editDebt ? String(editDebt.monthly_debt_service ?? "") : ""} placeholder="Nghĩa vụ/tháng"/><input className={inputClass} name="maturity_date" type="date" defaultValue={editDebt ? String(editDebt.maturity_date ?? "") : ""}/><input className={inputClass} name="next_payment_date" type="date" defaultValue={editDebt ? String(editDebt.next_payment_date ?? "") : ""}/><input className={inputClass} name="as_of_date" type="date" defaultValue={editDebt ? String(editDebt.as_of_date ?? "") : ""} required/><input className={inputClass} name="evidence_reference" defaultValue={editDebt ? String(editDebt.source_reference ?? "") : ""} placeholder="Sao kê/hợp đồng"/><button className="col-span-2 rounded-md bg-[#1769d2] px-3 py-2 text-[11px] font-bold text-white">{editDebt ? "Lưu sửa đổi → NEED_VERIFY" : "Lưu mới → NEED_VERIFY"}</button></form></FormShell>

          <FormShell id="input-asset" title="+ Tài sản / cập nhật giá trị" disabled={migrationMissing}><form action={savePersonalAsset} className="mt-3 grid grid-cols-2 gap-2"><input type="hidden" name="record_id" value={editAsset ? String(editAsset.id) : ""}/>{editAsset ? <div className="col-span-2 rounded bg-blue-50 p-2 text-[10px] font-semibold text-blue-800">Đang sửa: {String(editAsset.name)}. <a href="/personal-finance#input-asset" className="underline">Hủy sửa</a></div> : null}<input className={inputClass} name="name" defaultValue={editAsset ? String(editAsset.name) : ""} placeholder="Tên tài sản" required/><MasterDataSelect name="asset_type_code" options={assetTypes} defaultValue={editAsset ? String(editAsset.asset_type_code ?? "") : ""} required placeholder="Loại tài sản" className={inputClass}/><input className={inputClass} name="value_amount" defaultValue={editAsset ? String(editAsset.value_amount ?? "") : ""} placeholder="Giá trị" required/><select className={inputClass} name="valuation_kind" defaultValue={editAsset ? String(editAsset.valuation_kind ?? "ESTIMATED") : "ESTIMATED"}><option value="ESTIMATED">ESTIMATED</option><option value="VERIFIED">VERIFIED VALUE evidence pending</option><option value="UNKNOWN">UNKNOWN</option></select><input className={inputClass} name="as_of_date" type="date" defaultValue={editAsset ? String(editAsset.as_of_date ?? "") : ""} required/><input className={inputClass} name="evidence_reference" defaultValue={editAsset ? String(editAsset.source_reference ?? "") : ""} placeholder="Chứng thư/link bằng chứng"/><button className="col-span-2 rounded-md bg-[#1769d2] px-3 py-2 text-[11px] font-bold text-white">{editAsset ? "Lưu sửa đổi → NEED_VERIFY" : "Lưu mới → NEED_VERIFY"}</button></form></FormShell>

          <FormShell id="input-transfer" title="+ Business ↔ Personal transfer" disabled={migrationMissing}><form action={saveOwnerBusinessTransfer} className="mt-3 grid grid-cols-2 gap-2"><input type="hidden" name="record_id" value={editTransfer ? String(editTransfer.id) : ""}/>{editTransfer ? <div className="col-span-2 rounded bg-blue-50 p-2 text-[10px] font-semibold text-blue-800">Đang sửa transfer {String(editTransfer.transfer_date)} · {String(editTransfer.business_unit)}. <a href="/personal-finance#input-transfer" className="underline">Hủy sửa</a></div> : null}<input className={inputClass} name="transfer_date" type="date" defaultValue={editTransfer ? String(editTransfer.transfer_date) : ""} required/><select className={inputClass} name="business_unit" defaultValue={editTransfer ? String(editTransfer.business_unit) : "LAVENDER"}><option>LAVENDER</option><option>RUBY</option><option>COZY_GARDEN</option><option>HOSPITALITY_SHARED</option><option>OTHER</option></select><select className={inputClass} name="direction" defaultValue={editTransfer ? String(editTransfer.direction) : "BUSINESS_TO_PERSONAL"}><option>BUSINESS_TO_PERSONAL</option><option>PERSONAL_TO_BUSINESS</option></select><select className={inputClass} name="transfer_type" defaultValue={editTransfer ? String(editTransfer.transfer_type) : "OWNER_DISTRIBUTION"}><option>OWNER_DISTRIBUTION</option><option>OWNER_DRAW</option><option>SALARY_COMPENSATION</option><option>OWNER_CONTRIBUTION</option><option>PERSONAL_PAID_BUSINESS</option><option>BUSINESS_PAID_PERSONAL</option><option>OTHER</option></select><input className={inputClass} name="amount" defaultValue={editTransfer ? String(editTransfer.amount ?? "") : ""} placeholder="Số tiền" required/><input className={inputClass} name="evidence_reference" defaultValue={editTransfer ? String(editTransfer.source_reference ?? "") : ""} placeholder="Bằng chứng giao dịch" required/><button className="col-span-2 rounded-md bg-[#1769d2] px-3 py-2 text-[11px] font-bold text-white">{editTransfer ? "Lưu sửa đổi → NEED_VERIFY" : "Lưu mới → NEED_VERIFY"}</button></form></FormShell>

          <FormShell id="import-history" title="Import dữ liệu lịch sử từ Sheet" disabled={migrationMissing}><form action={importLegacyPersonalFinance} className="mt-3"><p className="text-[10px] text-[#64799d]">Đọc 04_GiaoDich + baseline nợ/quỹ từ workbook gia đình; import idempotent và mặc định NEED_VERIFY. Phân phối Hospitality có conflict sẽ không tự VERIFIED.</p><button className="mt-3 rounded-md bg-[#102456] px-3 py-2 text-[11px] font-bold text-white">Audit + Import lịch sử</button>{auditRes.data ? <pre className="mt-3 overflow-auto rounded-lg bg-slate-50 p-3 text-[9px]">{JSON.stringify(auditRes.data.metadata,null,2)}</pre>:null}</form></FormShell>
        </div>
      </section>
    </div>
  </TceWorkspaceShell>;
}
