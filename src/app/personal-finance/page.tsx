import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { TceWorkspaceShell } from "@/components/tce/TceShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function money(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n)
    ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n)
    : "—";
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(d);
}

function Status({ value }: { value: string }) {
  const ok = value === "VERIFIED";
  const label = ok ? "ĐÃ XÁC MINH" : value === "HOLD" ? "TẠM DỪNG" : "CẦN XÁC MINH";
  return <span className={"rounded-full px-2 py-1 text-[10px] font-bold " + (ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{label}</span>;
}

function Card({ label, value, source, updatedAt, status }: { label: string; value: string; source: string; updatedAt?: string | null; status: string }) {
  return (
    <div className="rounded-xl border border-[#dce8f4] bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold text-[#64799d]">{label}</p>
      <p className="mt-2 text-[24px] font-extrabold tracking-tight text-[#0b2455]">{value}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2"><Status value={status} /><span className="text-[9px] text-[#8190a7]">Nguồn: {source}</span></div>
      <p className="mt-1 text-[9px] text-[#95a0b0]">Cập nhật: {fmtDate(updatedAt)}</p>
    </div>
  );
}

export default async function PersonalFinancePage() {
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: profile } = await db.from("users").select("role").eq("id", auth.user.id).maybeSingle();
  if (profile?.role !== "owner") {
    return (
      <TceWorkspaceShell title="Tài chính cá nhân" subtitle="Khu vực riêng của chủ sở hữu" generatedAt={new Date().toISOString()}>
        <div className="p-6"><div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">Bạn không có quyền truy cập dữ liệu Tài chính cá nhân.</div></div>
      </TceWorkspaceShell>
    );
  }

  const raw = db as unknown as SupabaseClient;
  const now = new Date();
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit" }).format(now) + "-01";

  const [positionRes, monthRes, debtsRes, assetsRes, accountsRes, goalsRes, txRes, transferRes] = await Promise.all([
    raw.from("owner_finance_position_v").select("*").maybeSingle(),
    raw.from("personal_finance_monthly_v").select("*").eq("month", month).maybeSingle(),
    raw.from("personal_finance_debts").select("name,debt_type,current_principal,interest_rate_annual,monthly_debt_service,maturity_date,next_payment_date,as_of_date,source,verification_status,updated_at").order("current_principal", { ascending: false }),
    raw.from("personal_finance_assets").select("name,asset_type,value_amount,valuation_kind,as_of_date,source,verification_status,updated_at").order("value_amount", { ascending: false }),
    raw.from("personal_finance_accounts").select("name,account_type,current_balance,balance_as_of,is_liquid,is_emergency_fund,source,verification_status,updated_at").order("current_balance", { ascending: false }),
    raw.from("personal_finance_goals").select("name,goal_type,target_amount,target_date,source,verification_status,status,updated_at").eq("status", "ACTIVE"),
    raw.from("personal_finance_transactions").select("transaction_date,transaction_type,category,amount,source,verification_status,updated_at").gte("transaction_date", month).order("transaction_date", { ascending: false }).limit(50),
    raw.from("owner_business_transfers").select("transfer_date,business_unit,direction,transfer_type,amount,source,verification_status,updated_at").gte("transfer_date", month).order("transfer_date", { ascending: false }).limit(50),
  ]);

  const migrationMissing = [positionRes, monthRes, debtsRes, assetsRes, accountsRes, goalsRes].some((r) => r.error?.code === "42P01");
  const position = positionRes.data as Record<string, unknown> | null;
  const monthly = monthRes.data as Record<string, unknown> | null;
  const debts = (debtsRes.data ?? []) as Record<string, unknown>[];
  const assets = (assetsRes.data ?? []) as Record<string, unknown>[];
  const accounts = (accountsRes.data ?? []) as Record<string, unknown>[];
  const goals = (goalsRes.data ?? []) as Record<string, unknown>[];
  const transactions = (txRes.data ?? []) as Record<string, unknown>[];
  const transfers = (transferRes.data ?? []) as Record<string, unknown>[];

  const latestUpdate = [...debts, ...assets, ...accounts, ...goals, ...transactions, ...transfers]
    .map((x) => String(x.updated_at ?? ""))
    .filter(Boolean)
    .sort()
    .at(-1) || null;

  const unknownAssetCount = Number(position?.unverified_asset_count ?? 0);
  const unknownAccountCount = Number(position?.unverified_account_count ?? 0);
  const unknownDebtCount = Number(position?.unverified_debt_count ?? 0);
  const verifiedAssetCount = Number(position?.verified_asset_count ?? 0);
  const verifiedAccountCount = Number(position?.verified_account_count ?? 0);
  const emergencyFundAccountCount = Number(position?.emergency_fund_account_count ?? 0);
  const verifiedDebtCount = Number(position?.verified_debt_count ?? 0);
  const totalAssetsReady = position && unknownAssetCount === 0 && unknownAccountCount === 0 && (verifiedAssetCount + verifiedAccountCount) > 0;
  const debtReady = position && unknownDebtCount === 0 && verifiedDebtCount > 0;
  const cashReady = position && unknownAccountCount === 0 && verifiedAccountCount > 0;
  const emergencyFundReady = cashReady && emergencyFundAccountCount > 0;
  const netWorthReady = totalAssetsReady && unknownDebtCount === 0 && position?.net_worth !== null;
  const expenseCategories = ["Ăn uống", "Giáo dục", "Nhà ở", "Đi lại", "Y tế"] as const;
  const verifiedExpenses = transactions.filter((x) => x.transaction_type === "EXPENSE" && x.verification_status === "VERIFIED");
  const expenseSummary = [...expenseCategories, "Khác"].map((category) => ({
    category,
    amount: verifiedExpenses
      .filter((x) => category === "Khác" ? !expenseCategories.includes(String(x.category) as typeof expenseCategories[number]) : String(x.category) === category)
      .reduce((sum, x) => sum + Number(x.amount ?? 0), 0),
  }));

  return (
    <TceWorkspaceShell
      title="Tài chính cá nhân"
      subtitle="PERSONAL / FAMILY FINANCE · OWNER CONSOLIDATED VIEW · Không cộng doanh thu doanh nghiệp thành thu nhập cá nhân"
      generatedAt={new Date().toISOString()}
    >
      <div className="space-y-4 p-4 lg:p-5">
        {migrationMissing ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[12px] font-semibold text-amber-800">
            Financial Foundation migration chưa được áp dụng trên database production. Trang đang ở trạng thái HOLD và không suy số liệu.
          </div>
        ) : null}

        <section>
          <h2 className="mb-3 text-[15px] font-extrabold text-[#102456]">1. Tổng quan</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card label="Tài sản ròng" value={netWorthReady ? money(position?.net_worth) : "—"} source="Supabase Personal Finance" updatedAt={latestUpdate} status={netWorthReady ? "VERIFIED" : "NEED_VERIFY"} />
            <Card label="Tổng tài sản VERIFIED" value={totalAssetsReady ? money(position?.verified_assets) : "—"} source="Tài khoản + tài sản không trùng lặp" updatedAt={latestUpdate} status={totalAssetsReady ? "VERIFIED" : "NEED_VERIFY"} />
            <Card label="Tổng nợ VERIFIED" value={debtReady ? money(position?.verified_liabilities) : "—"} source="Supabase Personal Finance" updatedAt={latestUpdate} status={debtReady ? "VERIFIED" : "NEED_VERIFY"} />
            <Card label="Tiền khả dụng" value={cashReady ? money(position?.available_cash) : "—"} source="Tài khoản cá nhân đã xác minh" updatedAt={latestUpdate} status={cashReady ? "VERIFIED" : "NEED_VERIFY"} />
            <Card label="Thu nhập tháng" value={monthly ? money(monthly.personal_income_actual) : "—"} source="Personal + owner distribution VERIFIED" updatedAt={latestUpdate} status={monthly ? "VERIFIED" : "NEED_VERIFY"} />
            <Card label="Chi phí tháng" value={monthly ? money(monthly.personal_expense_actual) : "—"} source="Personal transactions VERIFIED" updatedAt={latestUpdate} status={monthly ? "VERIFIED" : "NEED_VERIFY"} />
            <Card label="Dòng tiền ròng tháng" value={monthly ? money(monthly.personal_net_cash_flow) : "—"} source="Personal + business transfer bridge" updatedAt={latestUpdate} status={monthly ? "VERIFIED" : "NEED_VERIFY"} />
            <Card label="Quỹ dự phòng" value={emergencyFundReady ? money(position?.emergency_fund) : "—"} source="Tài khoản đánh dấu Emergency Fund" updatedAt={latestUpdate} status={emergencyFundReady ? "VERIFIED" : "NEED_VERIFY"} />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section className="rounded-xl border border-[#dce8f4] bg-white p-4">
            <h2 className="text-[14px] font-extrabold text-[#102456]">2. Dòng tiền cá nhân</h2>
            <p className="mt-1 text-[10px] text-[#7185a5]">Chỉ dùng giao dịch VERIFIED; Owner distribution chỉ tính khi tiền thực nhận được xác minh.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[620px] text-[10px]">
                <thead className="bg-[#f3f7fb] text-[#466084]"><tr><th className="p-2 text-left">Ngày</th><th className="p-2 text-left">Loại</th><th className="p-2 text-left">Danh mục</th><th className="p-2 text-right">Số tiền</th><th className="p-2">Trạng thái</th></tr></thead>
                <tbody>{transactions.length ? transactions.map((x, i) => <tr key={i} className="border-t"><td className="p-2">{String(x.transaction_date)}</td><td className="p-2">{String(x.transaction_type)}</td><td className="p-2">{String(x.category)}</td><td className="p-2 text-right font-semibold">{money(x.amount)}</td><td className="p-2 text-center"><Status value={String(x.verification_status)} /></td></tr>) : <tr><td colSpan={5} className="p-6 text-center text-slate-500">Chưa có giao dịch tháng này đã nhập vào lớp Personal Finance.</td></tr>}</tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-[#dce8f4] bg-white p-4">
            <h2 className="text-[14px] font-extrabold text-[#102456]">3. Chi phí gia đình</h2>
            <p className="mt-1 text-[10px] text-[#7185a5]">Chỉ tổng hợp EXPENSE đã VERIFIED; danh mục ngoài taxonomy chuẩn được gom vào Khác.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {expenseSummary.map((item) => <div key={item.category} className="rounded-lg bg-[#f5f9fd] p-3 text-[10px]"><div className="font-semibold text-[#4c6385]">{item.category}</div><div className="mt-1 text-[14px] font-extrabold text-[#102456]">{verifiedExpenses.length ? money(item.amount) : "—"}</div></div>)}
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-[#dce8f4] bg-white p-4">
          <h2 className="text-[14px] font-extrabold text-[#102456]">4. Doanh nghiệp ↔ Cá nhân</h2>
          <p className="mt-1 text-[10px] text-[#7185a5]">Không copy báo cáo lãi lỗ (P&L). Chỉ ghi dòng tiền/lợi ích kinh tế thực sự chuyển giữa doanh nghiệp và cá nhân; bản ghi liên kết giao dịch chỉ được tính một lần.</p>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">{transfers.length ? transfers.map((x, i) => <div key={i} className="flex items-center justify-between rounded-lg border p-3 text-[10px]"><div><b>{String(x.business_unit)}</b><div className="text-slate-500">{String(x.transfer_type)} · {String(x.transfer_date)}</div></div><div className="text-right"><b>{money(x.amount)}</b><div className="mt-1"><Status value={String(x.verification_status)} /></div></div></div>) : <p className="py-4 text-[10px] text-slate-500">Chưa có dòng chuyển tiền doanh nghiệp ↔ cá nhân trong tháng.</p>}</div>
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section className="rounded-xl border border-[#dce8f4] bg-white p-4">
            <h2 className="text-[14px] font-extrabold text-[#102456]">5. Nợ</h2>
            <div className="mt-3 space-y-2">{debts.length ? debts.map((x, i) => <div key={i} className="rounded-lg border p-3 text-[10px]"><div className="flex justify-between gap-3"><b>{String(x.name)}</b><Status value={String(x.verification_status)} /></div><div className="mt-2 grid grid-cols-2 gap-2 text-slate-600"><span>Dư gốc: <b>{x.verification_status === "VERIFIED" ? money(x.current_principal) : "—"}</b></span><span>Nghĩa vụ/tháng: <b>{x.verification_status === "VERIFIED" ? money(x.monthly_debt_service) : "—"}</b></span><span>Đáo hạn: {String(x.maturity_date ?? "—")}</span><span>Nguồn: {String(x.source)}</span></div></div>) : <p className="py-6 text-center text-[10px] text-slate-500">Chưa có khoản nợ trong canonical Personal Finance.</p>}</div>
          </section>

          <section className="rounded-xl border border-[#dce8f4] bg-white p-4">
            <h2 className="text-[14px] font-extrabold text-[#102456]">6. Tài sản & tài khoản</h2>
            <p className="mt-1 text-[10px] text-[#7185a5]">Cash/Bank/E-wallet lấy từ tài khoản; bảng tài sản chỉ giữ tài sản không trùng số dư tài khoản.</p>
            <div className="mt-3 space-y-2">
              {accounts.map((x, i) => <div key={"account-" + i} className="rounded-lg border p-3 text-[10px]"><div className="flex justify-between gap-3"><b>{String(x.name)}</b><Status value={String(x.verification_status)} /></div><div className="mt-2 flex justify-between text-slate-600"><span>LIQUID · {String(x.account_type)}</span><b>{x.verification_status === "VERIFIED" ? money(x.current_balance) : "—"}</b></div></div>)}
              {assets.map((x, i) => <div key={"asset-" + i} className="rounded-lg border p-3 text-[10px]"><div className="flex justify-between gap-3"><b>{String(x.name)}</b><Status value={String(x.verification_status)} /></div><div className="mt-2 flex justify-between text-slate-600"><span>{String(x.asset_type)} · {String(x.valuation_kind)}</span><b>{x.verification_status === "VERIFIED" && x.valuation_kind === "VERIFIED" ? money(x.value_amount) : "—"}</b></div></div>)}
              {!accounts.length && !assets.length ? <p className="py-6 text-center text-[10px] text-slate-500">Chưa có tài sản/tài khoản trong canonical Personal Finance.</p> : null}
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-[#dce8f4] bg-white p-4">
          <h2 className="text-[14px] font-extrabold text-[#102456]">7. Hành trình Tự do tài chính</h2>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-6">
            {["Tài sản ròng","Quỹ dự phòng","Giảm nợ","Dòng tiền dương","Thu nhập bền vững","Mục tiêu tự do tài chính"].map((label, i) => <div key={label} className="rounded-lg bg-[#f5f9fd] p-3 text-center"><div className="text-[10px] font-bold text-[#294b77]">{i + 1}. {label}</div><div className="mt-2 text-[10px] text-[#8090aa]">{i === 5 ? (goals.find((g) => g.goal_type === "FINANCIAL_FREEDOM") ? money(goals.find((g) => g.goal_type === "FINANCIAL_FREEDOM")?.target_amount) : "—") : "Theo dõi theo Actual VERIFIED"}</div></div>)}
          </div>
          <p className="mt-3 text-[9px] text-[#8795aa]">Không có Financial Freedom Score. Không dự báo chính xác giả tạo khi assumptions chưa VERIFIED.</p>
        </section>
      </div>
    </TceWorkspaceShell>
  );
}
