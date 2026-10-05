"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { readBusinessCashRevenue } from "@/server/finance/business-cash-revenue";
import type { SupabaseClient } from "@supabase/supabase-js";

function localDate(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
function lastDay(y:number,m:number){return new Date(Date.UTC(y,m,0)).getUTCDate()}
export async function recordBusinessCashDeposit(formData:FormData){
  const scope=String(formData.get("scope")??""); if(!["COZY","HOMESTAY"].includes(scope)) throw new Error("Phạm vi chuyển tiền không hợp lệ.");
  const db=await createClient(); const raw=db as unknown as SupabaseClient; const {data:auth}=await db.auth.getUser(); if(!auth.user) throw new Error("Chưa đăng nhập.");
  const {data:profile}=await db.from("users").select("role").eq("id",auth.user.id).maybeSingle(); if(profile?.role!=="owner") throw new Error("Chỉ Owner được ghi nhận nộp tiền mặt.");
  const today=localDate(), [y,m,d]=today.split("-").map(Number), openDay=Math.min(30,lastDay(y,m)); if(d<openDay) throw new Error(`Nút nộp tiền tháng hiện tại chỉ mở từ ngày ${openDay}.`);
  const monthStart=today.slice(0,7)+"-01"; const snap=await readBusinessCashRevenue(db,monthStart,today); if(snap.state!=="VERIFIED") throw new Error("Tiền mặt chưa VERIFIED; không ghi nhận chuyển tiền.");
  const batch=`CASH-DEPOSIT-${today}-${Date.now()}`; const now=new Date().toISOString();
  const parts=scope==="COZY"?[{unit:"COZY_GARDEN",cash:"CASH-COZY",bank:"ROLE-TPBANK-COZY-888",amount:snap.cozy.onHand}]:[{unit:"LAVENDER",cash:"CASH-LAVENDER",bank:"OPEN-HKD-TUAN",amount:snap.lavender.onHand},{unit:"RUBY",cash:"CASH-RUBY",bank:"OPEN-HKD-TUAN",amount:snap.ruby.onHand}];
  const active=parts.filter(x=>x.amount>0); if(!active.length) throw new Error("Không còn tiền mặt chưa nộp trong tháng.");
  const tx=active.flatMap((x,i)=>[
    {external_key:`${batch}-${i}-OUT`,transaction_date:today,business_unit:x.unit,account_code:x.cash,transaction_type:"TRANSFER",category_code:"CASH_DEPOSIT_OUT",subcategory_code:"MONTH_END_CASH_SWEEP",counterparty:"Nộp tiền mặt vào tài khoản doanh thu",amount:x.amount,source_reference:batch,payment_status:"PAID",verification_status:"VERIFIED",created_by:auth.user.id,source:"OWNER_CONFIRMED_CASH_DEPOSIT",record_status:"ACTIVE",created_at:now,updated_at:now},
    {external_key:`${batch}-${i}-IN`,transaction_date:today,business_unit:x.unit,account_code:x.bank,transaction_type:"TRANSFER",category_code:"CASH_DEPOSIT_IN",subcategory_code:"MONTH_END_CASH_SWEEP",counterparty:"Tiền mặt nộp vào ngân hàng · chờ đối soát",amount:x.amount,source_reference:batch,payment_status:"NEED_VERIFY",verification_status:"NEED_VERIFY",created_by:auth.user.id,source:"OWNER_CONFIRMED_CASH_DEPOSIT",record_status:"ACTIVE",created_at:now,updated_at:now},
  ]);
  const {error}=await raw.from("business_finance_transactions").insert(tx); if(error) throw new Error("Không ghi được nghiệp vụ chuyển tiền: "+error.message);
  revalidatePath("/finance");
}
