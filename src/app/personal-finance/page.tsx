import { TceWorkspaceShell } from "@/components/tce/TceShell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat("vi-VN").format(n) + " ₫" : "—";
}

function statusLabel(value: unknown) {
  const s = String(value || "NEED_VERIFY");
  if (s === "VERIFIED") return "ĐÃ XÁC MINH";
  if (s === "HOLD") return "TẠM DỪNG";
  return "CẦN XÁC MINH";
}

function Card({ label, value, source, updated, status = "VERIFIED" }: { label: string; value: string; source: string; updated: string; status?: string }) {
  return (
    <div className="rounded-xl border border-[#dce8f4] bg-white p-4 shadow-[0_3px_14px_rgba(33,72,120,0.04)]">
      <p className="text-[11px] font-semibold text-[#61779b]">{label}</p>
      <p className="mt-2 text-[22px] font-extrabold tracking-[-0.03em] text-[#071b55]">{value}</p>
      <div className="mt-3 space-y-1 text-[9px] text-[#7a8faa]">
        <p>Nguồn: {source}</p>
        <p>Cập nhật: {updated}</p>
        <p>Trạng thái: <b>{statusLabel(status)}</b></p>
      </div>
    </div>
  );
}

export default async function PersonalFinancePage() {
  const supabase = await createClient();
  const generatedAt = new Date().toISOString();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return (
      <TceWorkspaceShell title="Tài chính cá nhân" subtitle="Dữ liệu riêng tư — cần đăng nhập" generatedAt={generatedAt}>
        <div className="p-6 text-sm text-slate-600">Không có phiên đăng nhập hợp lệ.</div>
      </TceWorkspaceShell>
    );
  }

  // Dynamic foundation tables are intentionally isolated until post-migration generated types are refreshed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: access, error: accessError } = await db
    .from("personal_finance_access")
    .select("can_read")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (accessError && /does not exist|schema cache/i.test(accessError.message || "")) {
    return (
      <TceWorkspaceShell
        title="Tài chính cá nhân"
        subtitle="Personal / Family Finance · Financial Freedom Management"
        generatedAt={generatedAt}
      >
        <div className="p-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Financial Foundation đã có code/migration nhưng database production chưa được migrate. Trạng thái: <b>HOLD — BACKUP GATE</b>.
          </div>
        </div>
      </TceWorkspaceShell>
    );
  }

  if (!access?.can_read) {
    return (
      <TceWorkspaceShell
        title="Tài chính cá nhân"
        subtitle="Dữ liệu riêng tư — quyền truy cập tách khỏi Hospitality Operations"
        generatedAt={generatedAt}
      >
        <div className="p-6 text-sm text-slate-600">Tài khoản hiện tại không có quyền Personal Finance.</div>
      </TceWorkspaceShell>
    );
  }

  const monthFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  });
  const monthPrefix = monthFormatter.format(new Date());
  const monthKey = monthPrefix + "-01";
  const [yearText, monthText] = monthPrefix.split("-");
  const nextMonthDate = new Date(Date.UTC(Number(yearText), Number(monthText), 1));
  const nextMonthKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(nextMonthDate);

  const [
    summaryResult,
    monthResult,
    debtsResult,
    assetsResult,
    goalsResult,
    expensesResult,
    freshnessTxResult,
    freshnessDebtResult,
    freshnessAssetResult,
    accountsResult,
  ] = await Promise.all([
    db.from("owner_finance_summary_v").select("*").eq("owner_user_id", authData.user.id).maybeSingle(),
    db.from("personal_finance_monthly_v").select("*").eq("owner_user_id", authData.user.id).eq("month", monthKey).maybeSingle(),
    db.from("personal_finance_debts").select("id,name,debt_type,principal_outstanding,annual_interest_rate,monthly_debt_service,maturity_date,next_payment_date,verification_status,source,updated_at").eq("owner_user_id", authData.user.id).eq("is_active", true).order("principal_outstanding", { ascending: false }),
    db.from("personal_finance_assets").select("id,name,asset_type,value_amount,value_as_of,value_status,is_emergency_fund,verification_status,source,updated_at").eq("owner_user_id", authData.user.id).order("value_amount", { ascending: false }),
    db.from("personal_finance_goals").select("id,name,goal_type,target_amount,target_date,verification_status,source,updated_at").eq("owner_user_id", authData.user.id).eq("is_active", true),
    db.from("personal_finance_transactions").select("category,amount").eq("owner_user_id", authData.user.id).eq("direction", "EXPENSE").eq("verification_status", "VERIFIED").gte("transaction_date", monthKey).lt("transaction_date", nextMonthKey),
    db.from("personal_finance_transactions").select("updated_at").eq("owner_user_id", authData.user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("personal_finance_debts").select("updated_at").eq("owner_user_id", authData.user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("personal_finance_assets").select("updated_at").eq("owner_user_id", authData.user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("personal_finance_accounts").select("id,current_balance,value_status,verification_status,updated_at").eq("owner_user_id", authData.user.id).eq("is_active", true),
  ]);

  const summary = summaryResult.data || {};
  const month = monthResult.data || {};
  const verifiedAssets = Number(summary.verified_assets || 0);
  const verifiedLiabilities = Number(summary.verified_liabilities || 0);
  const verifiedAssetRows = (assetsResult.data || []).filter((row: Record<string, unknown>) => row.verification_status === "VERIFIED" && row.value_status === "VERIFIED");
  const verifiedDebtRows = (debtsResult.data || []).filter((row: Record<string, unknown>) => row.verification_status === "VERIFIED");
  const verifiedAccountRows = (accountsResult.data || []).filter((row: Record<string, unknown>) => row.verification_status === "VERIFIED" && row.value_status === "VERIFIED");
  const hasVerifiedBalanceSheet = verifiedAssetRows.length > 0 || verifiedDebtRows.length > 0;
  const netWorth = verifiedAssets - verifiedLiabilities;
  const verifiedEmergencyFund = Number(summary.verified_emergency_fund || 0);
  const verifiedAvailableCash = Number(summary.verified_available_cash || 0);
  const debtService = Number(summary.verified_monthly_debt_service || 0);
  const income = Number(month.personal_income_actual || 0);
  const expense = Number(month.personal_expense_actual || 0);
  const netCashFlow = Number(month.personal_net_cash_flow || 0);

  const categoryMap = new Map<string, number>();
  for (const row of expensesResult.data || []) {
    const key = String(row.category || "Khác");
    categoryMap.set(key, (categoryMap.get(key) || 0) + Number(row.amount || 0));
  }
  const expenseCategories = [...categoryMap.entries()].sort((a, b) => b[1] - a[1]);

  const updatedCandidates = [
    freshnessTxResult.data?.updated_at,
    freshnessDebtResult.data?.updated_at,
    freshnessAssetResult.data?.updated_at,
  ].filter(Boolean).map((x: string) => Date.parse(x)).filter(Number.isFinite);
  const latestUpdated = updatedCandidates.length ? new Date(Math.max(...updatedCandidates)).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "Chưa có Actual VERIFIED";

  return (
    <TceWorkspaceShell
      title="Tài chính cá nhân"
      subtitle="Personal / Family Finance + Owner Consolidated View · chỉ dùng dữ liệu VERIFIED"
      generatedAt={generatedAt}
    >
      <div className="space-y-5 p-4 lg:p-5">
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card label="Tài sản ròng" value={hasVerifiedBalanceSheet ? money(netWorth) : "—"} source="Personal Finance verified assets − verified liabilities" updated={latestUpdated} status={hasVerifiedBalanceSheet ? "VERIFIED" : "NEED_VERIFY"} />
          <Card label="Tổng tài sản VERIFIED" value={verifiedAssetRows.length ? money(verifiedAssets) : "—"} source="Supabase · personal_finance_assets" updated={latestUpdated} status={verifiedAssetRows.length ? "VERIFIED" : "NEED_VERIFY"} />
          <Card label="Tổng nợ VERIFIED" value={verifiedDebtRows.length ? money(verifiedLiabilities) : "—"} source="Supabase · personal_finance_debts" updated={latestUpdated} status={verifiedDebtRows.length ? "VERIFIED" : "NEED_VERIFY"} />
          <Card label="Tiền khả dụng VERIFIED" value={verifiedAccountRows.length ? money(verifiedAvailableCash) : "—"} source="Supabase · personal_finance_accounts" updated={latestUpdated} status={verifiedAccountRows.length ? "VERIFIED" : "NEED_VERIFY"} />
          <Card label="Thu nhập tháng" value={monthResult.data ? money(income) : "—"} source="Personal Income + VERIFIED business distributions" updated={latestUpdated} status={monthResult.data ? "VERIFIED" : "NEED_VERIFY"} />
          <Card label="Chi phí tháng" value={monthResult.data ? money(expense) : "—"} source="Supabase · personal_finance_transactions" updated={latestUpdated} status={monthResult.data ? "VERIFIED" : "NEED_VERIFY"} />
          <Card label="Dòng tiền ròng tháng" value={monthResult.data ? money(netCashFlow) : "—"} source="Income − Expense" updated={latestUpdated} status={monthResult.data ? "VERIFIED" : "NEED_VERIFY"} />
          <Card label="Quỹ dự phòng VERIFIED" value={verifiedAssetRows.some((row: Record<string, unknown>) => row.is_emergency_fund === true) ? money(verifiedEmergencyFund) : "—"} source="Verified liquid emergency-fund assets" updated={latestUpdated} status={verifiedAssetRows.some((row: Record<string, unknown>) => row.is_emergency_fund === true) ? "VERIFIED" : "NEED_VERIFY"} />
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-[#dce8f4] bg-white p-4">
            <h2 className="text-sm font-extrabold text-[#102456]">Chi phí gia đình tháng hiện tại</h2>
            <p className="mt-1 text-[10px] text-[#7287aa]">Không tạo benchmark; chỉ nhóm các giao dịch EXPENSE đã VERIFIED.</p>
            <div className="mt-4 space-y-2">
              {expenseCategories.length ? expenseCategories.map(([name, value]) => (
                <div key={name} className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs">
                  <span className="text-slate-600">{name}</span><b className="text-slate-900">{money(value)}</b>
                </div>
              )) : <p className="text-xs text-slate-500">Chưa có chi phí VERIFIED trong kỳ.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-[#dce8f4] bg-white p-4">
            <h2 className="text-sm font-extrabold text-[#102456]">Nợ</h2>
            <p className="mt-1 text-[10px] text-[#7287aa]">Monthly debt service VERIFIED: {money(debtService)}</p>
            <div className="mt-4 space-y-3">
              {(debtsResult.data || []).length ? (debtsResult.data || []).map((row: Record<string, unknown>) => (
                <div key={String(row.id)} className="rounded-lg border border-slate-100 p-3 text-xs">
                  <div className="flex justify-between gap-3"><b>{String(row.name || "Khoản nợ")}</b><b>{money(row.principal_outstanding)}</b></div>
                  <p className="mt-1 text-[10px] text-slate-500">Đáo hạn: {String(row.maturity_date || "—")} · Kỳ tới: {String(row.next_payment_date || "—")}</p>
                  <p className="mt-1 text-[9px] text-slate-500">Nguồn: {String(row.source || "—")} · {statusLabel(row.verification_status)}</p>
                </div>
              )) : <p className="text-xs text-slate-500">Chưa có khoản nợ VERIFIED/được nhập trong Personal Finance.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-[#dce8f4] bg-white p-4">
            <h2 className="text-sm font-extrabold text-[#102456]">Tài sản</h2>
            <div className="mt-4 space-y-3">
              {(assetsResult.data || []).length ? (assetsResult.data || []).map((row: Record<string, unknown>) => (
                <div key={String(row.id)} className="rounded-lg border border-slate-100 p-3 text-xs">
                  <div className="flex justify-between gap-3"><b>{String(row.name || "Tài sản")}</b><b>{money(row.value_amount)}</b></div>
                  <p className="mt-1 text-[9px] text-slate-500">{String(row.asset_type || "OTHER")} · Giá trị: {String(row.value_status || "NEED_VERIFY")} · Nguồn: {String(row.source || "—")}</p>
                </div>
              )) : <p className="text-xs text-slate-500">Chưa có tài sản được backfill vào Personal Finance.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-[#dce8f4] bg-white p-4">
            <h2 className="text-sm font-extrabold text-[#102456]">Hành trình Tự do tài chính</h2>
            <div className="mt-4 grid gap-2 text-xs">
              {["Tài sản ròng hiện tại","Quỹ dự phòng","Giảm nợ","Dòng tiền tháng dương","Thu nhập bền vững","Mục tiêu Tự do tài chính"].map((label, index) => (
                <div key={label} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">{index + 1}</span>
                  <span className="font-semibold text-slate-700">{label}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {(goalsResult.data || []).map((row: Record<string, unknown>) => (
                <div key={String(row.id)} className="text-[10px] text-slate-500">
                  {String(row.name)} · Mục tiêu {money(row.target_amount)} · {statusLabel(row.verification_status)}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </TceWorkspaceShell>
  );
}
