import "server-only";
import { KiotVietFnbClient } from "@/server/integrations/kiotviet/fnb-client";
import { KiotVietHotelClient } from "@/server/integrations/kiotviet/hotel-client";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
export type CashBucket = { collected:number; deposited:number; onHand:number; status:"VERIFIED"|"NEED_VERIFY"|"HOLD" };
export type BusinessCashRevenueSnapshot = {
  month:string; through:string; state:"VERIFIED"|"NEED_VERIFY"|"HOLD";
  cozy:CashBucket; lavender:CashBucket; ruby:CashBucket; homestay:CashBucket;
  unknownHotelCash:number; note:string;
};

const CASH_ACCOUNTS = { cozy:"CASH-COZY", lavender:"CASH-LAVENDER", ruby:"CASH-RUBY" } as const;
function rows(payload: unknown): Row[] { if(!payload||typeof payload!=="object") return []; const r=payload as Row; if(Array.isArray(r.data)) return r.data.filter((x):x is Row=>!!x&&typeof x==="object"); const rr=r.result; return rr&&typeof rr==="object"&&Array.isArray((rr as Row).data)?((rr as Row).data as unknown[]).filter((x):x is Row=>!!x&&typeof x==="object"):[]; }
function total(payload: unknown,fallback:number){ if(!payload||typeof payload!=="object") return fallback; const r=payload as Row; const a=Number(r.total); if(Number.isFinite(a))return a; const rr=r.result; const b=rr&&typeof rr==="object"?Number((rr as Row).total):NaN; return Number.isFinite(b)?b:fallback; }
function num(v:unknown){const n=Number(v??0);return Number.isFinite(n)?n:0}
function cancelled(row:Row){const s=String(row.statusValue??"").toLowerCase();return /hủy|huỷ|cancel|void/.test(s)}
function isCash(p:Row){const m=String(p.method??p.paymentMethod??p.methodName??"").toLowerCase();return m==="cash"||m.includes("tiền mặt")||m.includes("tien mat")}
function payments(row:Row){return Array.isArray(row.payments)?row.payments.filter((x):x is Row=>!!x&&typeof x==="object"):[]}

async function hotelInvoices(client:KiotVietHotelClient,from:string,to:string){const out:Row[]=[];for(let pageIndex=1;pageIndex<=100;pageIndex++){const q=new URLSearchParams({fromPurchaseDate:from,toPurchaseDate:to,pageSize:"100",pageIndex:String(pageIndex),includePayment:"true",includeSaleChannel:"true"});const res=await client.listInvoices(q.toString());if(!res.ok)throw new Error("HOTEL_INVOICE_HTTP_"+res.status);const batch=rows(res.data);out.push(...batch);if(!batch.length||out.length>=total(res.data,out.length)||batch.length<100)break}return out.filter(x=>!cancelled(x))}
async function fnbInvoices(client:KiotVietFnbClient,from:string,to:string){const out:Row[]=[];let currentItem=0;for(let page=0;page<100;page++){const q=new URLSearchParams({fromPurchaseDate:from,toPurchaseDate:to,pageSize:"100",currentItem:String(currentItem),includePayment:"true",orderBy:"Id",orderDirection:"Asc"});const res=await client.listInvoices(q.toString());if(!res.ok)throw new Error("FNB_INVOICE_HTTP_"+res.status);const batch=rows(res.data);out.push(...batch);currentItem+=batch.length;if(!batch.length||out.length>=total(res.data,out.length)||batch.length<100)break}return out.filter(x=>!cancelled(x))}

export async function readBusinessCashRevenue(db:SupabaseClient, monthStart:string, through:string):Promise<BusinessCashRevenueSnapshot>{
  const hotel=new KiotVietHotelClient(), fnb=new KiotVietFnbClient();
  if(!hotel.isConfigured()||!fnb.isConfigured()) return {month:monthStart.slice(0,7),through,state:"HOLD",cozy:{collected:0,deposited:0,onHand:0,status:"HOLD"},lavender:{collected:0,deposited:0,onHand:0,status:"HOLD"},ruby:{collected:0,deposited:0,onHand:0,status:"HOLD"},homestay:{collected:0,deposited:0,onHand:0,status:"HOLD"},unknownHotelCash:0,note:"KiotViet chưa cấu hình đầy đủ."};
  try{
    const [hotelRows,fnbRows,branchesRes,transferRes]=await Promise.all([
      hotelInvoices(hotel,monthStart,through), fnbInvoices(fnb,monthStart,through), hotel.listBranches(),
      db.from("business_finance_transactions").select("account_code,amount,category_code,verification_status,record_status").eq("transaction_type","TRANSFER").eq("category_code","CASH_DEPOSIT_OUT").eq("record_status","ACTIVE").gte("transaction_date",monthStart).lte("transaction_date",through)
    ]);
    const branchMap=new Map(rows(branchesRes.data).map(r=>[String(r.id),String(r.branchName??r.name??"")]));
    let cozy=0,lavender=0,ruby=0,unknown=0;
    for(const inv of fnbRows) for(const p of payments(inv)) if(isCash(p)) cozy+=num(p.amount??p.value??p.total);
    for(const inv of hotelRows){const branch=String(inv.branchName??branchMap.get(String(inv.branchId??""))??"").toLowerCase();let c=0;for(const p of payments(inv))if(isCash(p))c+=num(p.amount??p.value??p.total);if(!c)continue;if(branch.includes("lavender"))lavender+=c;else if(branch.includes("ruby"))ruby+=c;else unknown+=c;}
    const deposited={cozy:0,lavender:0,ruby:0};
    for(const t of (transferRes.data??[]) as Row[]){if(t.verification_status!=="VERIFIED")continue;const a=num(t.amount);if(t.account_code===CASH_ACCOUNTS.cozy)deposited.cozy+=a;if(t.account_code===CASH_ACCOUNTS.lavender)deposited.lavender+=a;if(t.account_code===CASH_ACCOUNTS.ruby)deposited.ruby+=a;}
    const mk=(collected:number,dep:number,status:"VERIFIED"|"NEED_VERIFY"):CashBucket=>({collected,deposited:dep,onHand:Math.max(0,collected-dep),status});
    const hotelStatus=unknown>0?"NEED_VERIFY":"VERIFIED";
    const c=mk(cozy,deposited.cozy,"VERIFIED"), l=mk(lavender,deposited.lavender,hotelStatus), r=mk(ruby,deposited.ruby,hotelStatus);
    return {month:monthStart.slice(0,7),through,state:unknown>0?"NEED_VERIFY":"VERIFIED",cozy:c,lavender:l,ruby:r,homestay:mk(lavender+ruby,deposited.lavender+deposited.ruby,hotelStatus),unknownHotelCash:unknown,note:unknown>0?"Có tiền mặt Hotel chưa map được Lavender/Ruby; giữ NEED VERIFY.":"Tiền mặt = payment method Tiền mặt từ KiotViet trong tháng − khoản đã ghi nhận nộp ngân hàng."};
  }catch{return {month:monthStart.slice(0,7),through,state:"HOLD",cozy:{collected:0,deposited:0,onHand:0,status:"HOLD"},lavender:{collected:0,deposited:0,onHand:0,status:"HOLD"},ruby:{collected:0,deposited:0,onHand:0,status:"HOLD"},homestay:{collected:0,deposited:0,onHand:0,status:"HOLD"},unknownHotelCash:0,note:"Không đọc được đầy đủ KiotViet cash payment; không thay bằng 0."};}
}
