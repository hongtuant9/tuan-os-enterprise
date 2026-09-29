"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isAllowedRestrictedTransfer, transferPreview, validateAllocation } from "@/server/finance/finance-cutover-core";

function untyped<T>(db:T){return db as unknown as SupabaseClient;}
async function owner(){const db=await createClient();const {data:a}=await db.auth.getUser();if(!a.user)throw new Error("Bạn cần đăng nhập.");const {data:p}=await db.from("users").select("role").eq("id",a.user.id).maybeSingle();if(p?.role!=="owner")throw new Error("Chỉ Owner được thao tác Finance Control.");return {db:untyped(db),userId:a.user.id};}
function text(form:FormData,key:string){const v=String(form.get(key)??"").trim();if(!v)throw new Error(`${key} là bắt buộc.`);return v;}
function amount(form:FormData,key:string){const raw=String(form.get(key)??"").replace(/[.\s]/g,"").replace(",",".");const v=Number(raw||0);if(!Number.isFinite(v)||v<0)throw new Error(`${key} không hợp lệ.`);return v;}

export async function saveFinanceAllocationDraft(form:FormData){
  const {db,userId}=await owner(); const month=text(form,"proposal_month");
  const {data:snap,error:snapError}=await db.rpc("finance_operating_snapshot",{p_month:month});
  if(snapError||!snap||typeof snap!=="object")throw new Error("Không đọc được Finance Operating Snapshot.");
  const summary=(snap as Record<string,unknown>).summary as Record<string,unknown>|undefined;
  const ownerDistributable=summary?.ownerDistributableCash==null?null:Number(summary.ownerDistributableCash);
  const taxRequired=summary?.taxProvision==null?null:Number(summary.taxProvision);
  const buckets={taxReserve:amount(form,"tax_reserve"),personal:amount(form,"personal"),emergencyFund:amount(form,"emergency_fund"),debtRepayment:amount(form,"debt_repayment"),overdraft401:amount(form,"overdraft_401"),businessReserve:amount(form,"business_reserve"),other:amount(form,"other")};
  const gate=validateAllocation({ownerDistributableCash:ownerDistributable,taxReserveRequired:taxRequired,buckets});
  if(!gate.ok)throw new Error(`Phân bổ bị HOLD: ${gate.reason}. Không thể vượt Tax/Distributable Cash gate.`);
  const {data:existing}=await db.from("finance_allocation_proposals").select("id").eq("proposal_month",month).eq("business_unit","CONSOLIDATED").eq("status","DRAFT").maybeSingle();
  const payload={proposal_month:month,business_unit:"CONSOLIDATED",profit_before_tax:summary?.profitBeforeTax??null,tax_reserve_required:taxRequired,profit_after_tax:summary?.profitAfterTax??null,business_cash:summary?.businessCash??null,accounts_payable:summary?.knownAp??null,debt_interest_due:summary?.projectedInterest??null,operating_reserve_required:summary?.operatingReserveRequired??null,owner_distributable_cash:ownerDistributable,owner_adjustment:buckets,total_allocation:gate.total,remaining_cash:ownerDistributable!-gate.ownerUse,status:"DRAFT",verification_status:"VERIFIED",calculation_note:"Owner adjustment validated against canonical Finance Operating Snapshot. No bank transfer executed.",updated_by:userId};
  const q=existing?.id?db.from("finance_allocation_proposals").update(payload).eq("id",existing.id):db.from("finance_allocation_proposals").insert({...payload,created_by:userId});
  const {error}=await q;if(error)throw new Error(error.message);revalidatePath("/personal-finance");
}

export async function approveFinanceAllocationProposal(form:FormData){
  const {db,userId}=await owner(); const id=text(form,"proposal_id"); const confirm=text(form,"confirmation");
  if(confirm!=="PHÊ DUYỆT")throw new Error("Nhập đúng PHÊ DUYỆT để xác nhận phương án nội bộ.");
  const {data:row,error:rerr}=await db.from("finance_allocation_proposals").select("*").eq("id",id).maybeSingle();if(rerr||!row)throw new Error("Không tìm thấy phương án.");
  if(row.verification_status!=="VERIFIED")throw new Error("Phương án chưa VERIFIED.");
  const {error}=await db.from("finance_allocation_proposals").update({status:"APPROVED",updated_by:userId,updated_at:new Date().toISOString()}).eq("id",id);if(error)throw new Error(error.message);revalidatePath("/personal-finance");
}

export async function prepareFinanceTransfer(form:FormData){
  const {db,userId}=await owner(); const proposalId=text(form,"proposal_id"),sourceCode=text(form,"source_account_code"),destinationCode=String(form.get("destination_account_code")??"").trim()||null,purpose=text(form,"purpose"),transferAmount=amount(form,"amount");
  if(transferAmount<=0)throw new Error("Số tiền phải > 0.");
  const {data:proposal}=await db.from("finance_allocation_proposals").select("id,status,owner_distributable_cash").eq("id",proposalId).maybeSingle();if(!proposal||proposal.status!=="APPROVED")throw new Error("Phương án phải được CEO phê duyệt trước khi chuẩn bị transfer.");
  const {data:source}=await db.from("finance_accounts").select("account_code,account_roles,bank_balance,current_balance").eq("account_code",sourceCode).maybeSingle();if(!source)throw new Error("Source account không hợp lệ.");
  if(!isAllowedRestrictedTransfer((source.account_roles??[]) as string[],purpose))throw new Error("Tài khoản restricted không được dùng cho mục đích này.");
  const sourceBalance=Number(source.bank_balance??source.current_balance??0); let destinationBalance=0;
  if(destinationCode){const {data:dest}=await db.from("finance_accounts").select("bank_balance,current_balance").eq("account_code",destinationCode).maybeSingle();if(!dest)throw new Error("Destination account không hợp lệ.");destinationBalance=Number(dest.bank_balance??dest.current_balance??0);}
  const preview=transferPreview({sourceBalance,destinationBalance,amount:transferAmount});
  const transferId=`TRF-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
  const {data:approval,error:aerr}=await db.from("approvals").insert({title:`Finance transfer ${transferId}`,summary:`PREVIEW ONLY · ${sourceCode} → ${destinationCode??"external"} · ${transferAmount.toLocaleString("vi-VN")} VND · ${purpose}. No bank execution.`,unit:"Finance",requested_by:"TUAN OS",status:"pending",request_type:"finance_transfer",change_key:transferId,entity:"finance_transfer_requests",current_value:String(preview.sourceBefore),proposed_value:String(preview.sourceAfter),source_channel:"personal-finance",severity:"high",execution_status:"not_applicable"}).select("id").single();if(aerr)throw new Error(aerr.message);
  const {error}=await db.from("finance_transfer_requests").insert({transfer_id:transferId,proposal_id:proposalId,approval_id:approval.id,source_account_code:sourceCode,destination_account_code:destinationCode,purpose,amount:transferAmount,source_balance_before:preview.sourceBefore,source_balance_after:preview.sourceAfter,destination_balance_before:preview.destinationBefore,destination_balance_after:preview.destinationAfter,status:"DRAFT",verification_status:"HOLD",created_by:userId,updated_by:userId});if(error)throw new Error(error.message);
  revalidatePath("/personal-finance");
}
