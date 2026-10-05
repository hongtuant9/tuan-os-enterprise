"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { readBusinessCashRevenue } from "@/server/finance/business-cash-revenue";
import { suggestProfitAllocation, validateProfitAllocation } from "@/server/finance/profit-allocation-core";
import type { SupabaseClient } from "@supabase/supabase-js";

const MONTHLY_FAMILY_BUDGET=75_762_500; // FIN-MASTER-001 / 06_NGAN_SACH_MUC_TIEU · VERIFIED + CONFIRMED
function localDate(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
function lastDay(y:number,m:number){return new Date(Date.UTC(y,m,0)).getUTCDate()}
function numberField(form:FormData,key:string){const raw=String(form.get(key)??"").trim().replace(/[.\s]/g,"").replace(",",".");const v=Number(raw||0);if(!Number.isFinite(v)||v<0)throw new Error(`${key} không hợp lệ.`);return v}
function textField(form:FormData,key:string){const v=String(form.get(key)??"").trim();if(!v)throw new Error(`${key} là bắt buộc.`);return v}
async function owner(){const db=await createClient();const raw=db as unknown as SupabaseClient;const {data:auth}=await db.auth.getUser();if(!auth.user)throw new Error("Chưa đăng nhập.");const {data:profile}=await db.from("users").select("role").eq("id",auth.user.id).maybeSingle();if(profile?.role!=="owner")throw new Error("Chỉ Owner được thao tác phân bổ tài chính.");return {db,raw,userId:auth.user.id}}

export async function recordBusinessCashDeposit(formData:FormData){
  const scope=String(formData.get("scope")??""); if(!["COZY","HOMESTAY"].includes(scope)) throw new Error("Phạm vi chuyển tiền không hợp lệ.");
  const {db,raw,userId}=await owner();
  const today=localDate(), [y,m,d]=today.split("-").map(Number), openDay=Math.min(30,lastDay(y,m)); if(d<openDay) throw new Error(`Nút nộp tiền tháng hiện tại chỉ mở từ ngày ${openDay}.`);
  const monthStart=today.slice(0,7)+"-01"; const snap=await readBusinessCashRevenue(db,monthStart,today); if(snap.state!=="VERIFIED") throw new Error("Tiền mặt chưa VERIFIED; không ghi nhận chuyển tiền.");
  const batch=`CASH-DEPOSIT-${today}-${Date.now()}`; const now=new Date().toISOString();
  const parts=scope==="COZY"?[{unit:"COZY_GARDEN",cash:"CASH-COZY",bank:"OPEN-BIDV-TUAN",amount:snap.cozy.onHand}]:[{unit:"LAVENDER",cash:"CASH-LAVENDER",bank:"OPEN-BIDV-TUAN",amount:snap.lavender.onHand},{unit:"RUBY",cash:"CASH-RUBY",bank:"OPEN-BIDV-TUAN",amount:snap.ruby.onHand}];
  const active=parts.filter(x=>x.amount>0); if(!active.length) throw new Error("Không còn tiền mặt chưa nộp trong tháng.");
  const tx=active.flatMap((x,i)=>[
    {external_key:`${batch}-${i}-OUT`,transaction_date:today,business_unit:x.unit,account_code:x.cash,transaction_type:"TRANSFER",category_code:"CASH_DEPOSIT_OUT",subcategory_code:"MONTH_END_CASH_SWEEP",counterparty:"Nộp tiền mặt vào BIDV 888",amount:x.amount,source_reference:batch,payment_status:"PAID",verification_status:"VERIFIED",created_by:userId,source:"OWNER_CONFIRMED_CASH_DEPOSIT",record_status:"ACTIVE",created_at:now,updated_at:now},
    {external_key:`${batch}-${i}-IN`,transaction_date:today,business_unit:x.unit,account_code:x.bank,transaction_type:"TRANSFER",category_code:"CASH_DEPOSIT_IN",subcategory_code:"MONTH_END_CASH_SWEEP",counterparty:"Tiền mặt nộp BIDV 888 · chờ đối soát",amount:x.amount,source_reference:batch,payment_status:"NEED_VERIFY",verification_status:"NEED_VERIFY",created_by:userId,source:"OWNER_CONFIRMED_CASH_DEPOSIT",record_status:"ACTIVE",created_at:now,updated_at:now},
  ]);
  const {error}=await raw.from("business_finance_transactions").insert(tx); if(error) throw new Error("Không ghi được nghiệp vụ chuyển tiền: "+error.message);
  revalidatePath("/finance");
}

export async function generateProfitAllocationSuggestion(formData:FormData){
  const {raw,userId}=await owner();
  const month=textField(formData,"proposal_month");
  const profitAfterTax=numberField(formData,"profit_after_tax");
  const workingCapitalReserve=numberField(formData,"working_capital_reserve");
  if(workingCapitalReserve>profitAfterTax)throw new Error("Vốn lưu động giữ lại không thể lớn hơn lợi nhuận sau thuế.");
  const [{data:account},{data:monthly}]=await Promise.all([
    raw.from("personal_finance_accounts").select("current_balance,balance_as_of,verification_status").eq("external_key","TPBANK-501").eq("record_status","ACTIVE").maybeSingle(),
    raw.from("personal_finance_monthly_v").select("personal_income_actual,personal_expense_actual,verified_business_distribution_received").eq("month",month).maybeSingle(),
  ]);
  if(!account||account.verification_status!=="VERIFIED")throw new Error("TPBank 501 chưa VERIFIED; AI không được suy CEO Draw.");
  const suggestion=suggestProfitAllocation({
    profitAfterTax,workingCapitalReserve,monthlyFamilyBudget:MONTHLY_FAMILY_BUDGET,
    personalOpeningBalance:Number(account.current_balance??0),
    personalIncomeActual:Number(monthly?.personal_income_actual??0)-Number(monthly?.verified_business_distribution_received??0),
    businessDistributionReceived:Number(monthly?.verified_business_distribution_received??0),
    personalExpenseActual:Number(monthly?.personal_expense_actual??0),
  });
  const recommendation={...suggestion,monthlyFamilyBudget:MONTHLY_FAMILY_BUDGET,profitAfterTax,workingCapitalReserve,source:"FIN-MASTER-001 + personal_finance_monthly_v",policy:"Working capital → CEO Draw top-up → remaining 60% debt / 25% safety / 15% reinvestment"};
  const {data:existing}=await raw.from("finance_allocation_proposals").select("id").eq("proposal_month",month).eq("business_unit","CONSOLIDATED").in("status",["DRAFT","READY_FOR_CEO"]).order("updated_at",{ascending:false}).limit(1).maybeSingle();
  const payload={proposal_month:month,business_unit:"CONSOLIDATED",profit_after_tax:profitAfterTax,operating_reserve_required:workingCapitalReserve,owner_distributable_cash:suggestion.distributableAfterReserve,recommendation,owner_adjustment:{ceoDraw:suggestion.ceoDraw,debtRepayment:suggestion.debtRepayment,emergencyFund:suggestion.emergencyFund,reinvestment:suggestion.reinvestment},total_allocation:suggestion.distributableAfterReserve,remaining_cash:0,status:"DRAFT",verification_status:"ESTIMATED",calculation_note:"AI suggestion only. Owner must review and approve. No bank transfer executed.",updated_by:userId};
  const q=existing?.id?raw.from("finance_allocation_proposals").update(payload).eq("id",existing.id):raw.from("finance_allocation_proposals").insert({...payload,created_by:userId});
  const {error}=await q;if(error)throw new Error(error.message);revalidatePath("/finance");
}

export async function saveProfitAllocationDraft(formData:FormData){
  const {raw,userId}=await owner();
  const id=textField(formData,"proposal_id");
  const {data:row,error}=await raw.from("finance_allocation_proposals").select("*").eq("id",id).maybeSingle();if(error||!row)throw new Error("Không tìm thấy phương án phân bổ.");
  if(!["DRAFT","READY_FOR_CEO"].includes(String(row.status)))throw new Error("Phương án này không còn được chỉnh sửa.");
  const distributable=Number(row.owner_distributable_cash??0);
  const ceoDraw=numberField(formData,"ceo_draw"),debtRepayment=numberField(formData,"debt_repayment"),emergencyFund=numberField(formData,"emergency_fund"),reinvestment=numberField(formData,"reinvestment");
  const gate=validateProfitAllocation({distributableAfterReserve:distributable,ceoDraw,debtRepayment,emergencyFund,reinvestment});
  if(!gate.ok)throw new Error(gate.reason==="UNALLOCATED_BALANCE"?"Cần phân bổ đủ 100% phần lợi nhuận có thể phân chia.":"Tổng phân bổ vượt số tiền có thể phân chia.");
  const owner_adjustment={ceoDraw,debtRepayment,emergencyFund,reinvestment};
  const {error:updateError}=await raw.from("finance_allocation_proposals").update({owner_adjustment,total_allocation:gate.total,remaining_cash:0,status:"READY_FOR_CEO",verification_status:"VERIFIED",calculation_note:"Arithmetic verified against approved allocation policy. Awaiting explicit CEO approval; no bank transfer executed.",updated_by:userId,updated_at:new Date().toISOString()}).eq("id",id);
  if(updateError)throw new Error(updateError.message);revalidatePath("/finance");
}

export async function approveProfitAllocation(formData:FormData){
  const {raw,userId}=await owner();
  const id=textField(formData,"proposal_id"),confirmation=textField(formData,"confirmation");
  if(confirmation!=="DUYỆT PHÂN CHIA")throw new Error("Nhập đúng DUYỆT PHÂN CHIA để xác nhận.");
  const {data:row,error}=await raw.from("finance_allocation_proposals").select("*").eq("id",id).maybeSingle();if(error||!row)throw new Error("Không tìm thấy phương án.");
  if(row.status!=="READY_FOR_CEO"||row.verification_status!=="VERIFIED")throw new Error("Phương án chưa READY_FOR_CEO / VERIFIED.");
  const adj=(row.owner_adjustment??{}) as Record<string,unknown>; const ceo=Number(adj.ceoDraw??0),debt=Number(adj.debtRepayment??0),safety=Number(adj.emergencyFund??0),reinvest=Number(adj.reinvestment??0);
  const gate=validateProfitAllocation({distributableAfterReserve:Number(row.owner_distributable_cash??0),ceoDraw:ceo,debtRepayment:debt,emergencyFund:safety,reinvestment:reinvest});if(!gate.ok)throw new Error("Phương án không còn cân bằng; cần lưu lại trước khi duyệt.");
  const {count}=await raw.from("finance_transfer_requests").select("id",{count:"exact",head:true}).eq("proposal_id",id).neq("status","CANCELLED");if((count??0)>0)throw new Error("Phương án này đã sinh yêu cầu phân bổ trước đó.");
  const now=new Date().toISOString(); const stamp=Date.now();
  const rows=[
    {key:"CEO",amount:ceo,dest:"ROLE-TPBANK-PERSONAL-501",label:"TPBank 501 – CEO / gia đình",purpose:"CEO_PROFIT_DISTRIBUTION",personal_cash_impact:ceo},
    {key:"DEBT401",amount:debt,dest:null,label:"BIDV-OD-401",purpose:"DEBT_REPAYMENT_401",debt_impact:-debt},
    {key:"SAFETY",amount:safety,dest:"ROLE-TPBANK-SAFETY",label:"TKTK_A01 – Quỹ an toàn",purpose:"PERSONAL_SAFETY_FUND_ALLOCATION",emergency_fund_impact:safety},
    {key:"REINVEST",amount:reinvest,dest:"ROLE-TPBANK-TCE-RESERVE-1984",label:"TTKTK_A02 – Tái đầu tư / dự phòng",purpose:"BUSINESS_REINVESTMENT_RESERVE",business_liquidity_impact:-reinvest},
  ].filter(x=>x.amount>0).map(x=>({transfer_id:`ALLOC-${row.proposal_month}-${x.key}-${stamp}`,proposal_id:id,source_account_code:"OPEN-BIDV-TUAN",destination_account_code:x.dest,destination_label:x.label,purpose:x.purpose,amount:x.amount,personal_cash_impact:x.personal_cash_impact??0,emergency_fund_impact:x.emergency_fund_impact??0,debt_impact:x.debt_impact??0,business_liquidity_impact:x.business_liquidity_impact??0,status:"APPROVED",verification_status:"HOLD",created_by:userId,updated_by:userId,created_at:now,updated_at:now}));
  if(rows.length){const {error:insertError}=await raw.from("finance_transfer_requests").insert(rows);if(insertError)throw new Error(insertError.message)}
  const {error:approveError}=await raw.from("finance_allocation_proposals").update({status:"APPROVED",calculation_note:"CEO approved allocation. System transfer requests created; bank balances remain unchanged until actual transfer/reconciliation evidence.",updated_by:userId,updated_at:now}).eq("id",id);if(approveError)throw new Error(approveError.message);
  revalidatePath("/finance");revalidatePath("/personal-finance");
}
