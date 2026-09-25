import "server-only";
import { getAdminContainer } from "@/server/container";
import { TRELLO_EXECUTION_BOARD, trelloRuntimeConfigured } from "@/server/agents/execution-governance";
import type { Json } from "@/lib/supabase/types";

type Fields = Record<string,string>;
type Card = { id:string; name:string; desc:string; idList:string };
type Checklist = { id:string; name:string; checkItems:Array<{id:string;name:string;state:string}> };
export type TrelloMirrorResult = {
  ok:boolean; configured:boolean; scanned:number; created:number; updated:number;
  moved:number; checklists:number; heldVerify:number; errors:string[];
};

const API="https://api.trello.com/1";
function cfg(){
  return {
    key:process.env.TRELLO_API_KEY?.trim()||"",
    token:process.env.TRELLO_TOKEN?.trim()||"",
    board:process.env.TRELLO_BOARD_ID?.trim()||TRELLO_EXECUTION_BOARD.boardObjectId,
  };
}
function q(path:string, extra:Record<string,string>={}){
  const c=cfg(); const u=new URL(API+path);
  u.searchParams.set("key",c.key); u.searchParams.set("token",c.token);
  for(const [k,v] of Object.entries(extra)) u.searchParams.set(k,v);
  return u;
}
async function api<T>(path:string, init:RequestInit={}, extra:Record<string,string>={}):Promise<T>{
  const r=await fetch(q(path,extra),{...init,signal:AbortSignal.timeout(20000)});
  if(!r.ok) throw new Error(`Trello ${r.status} ${path}`);
  return r.json() as Promise<T>;
}
function fields(data:Json):Fields{
  if(!data||Array.isArray(data)||typeof data!=="object") return {};
  return Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v==null?"":String(v)]));
}
function first(f:Fields,...keys:string[]){ for(const k of keys){const v=f[k]?.trim(); if(v)return v;} return ""; }
function norm(v:string){return v.trim().toUpperCase().replaceAll("-","_").replaceAll(" ","_");}
function taskId(f:Fields,target:string|null){return first(f,"TASK_ID","MÃ CÔNG VIỆC")||target||"";}
function evidence(f:Fields){return first(f,"EVIDENCE","EVIDENCE_TO_CLOSE","BẰNG CHỨNG","BẰNG CHỨNG / LIÊN KẾT","RESULT_EVIDENCE");}
function listFor(status:string, blocker:string, approval:boolean, hasEvidence:boolean){
  const s=norm(status), L=TRELLO_EXECUTION_BOARD.lists;
  if((s==="DONE"||s.includes("HOÀN_THÀNH"))&&!hasEvidence) return {id:L.VERIFY,held:true,label:"NEED VERIFY"};
  if(s==="DONE"||s.includes("HOÀN_THÀNH")) return {id:L.DONE,held:false,label:"DONE"};
  if(blocker||s.includes("BLOCK")||s.includes("HOLD")||s.includes("VƯỚNG")) return {id:L.BLOCKED_HOLD,held:false,label:"BLOCKED / HOLD"};
  if(approval||s.includes("APPROVAL")||s.includes("CHỜ_DUYỆT")) return {id:L.WAITING_APPROVAL,held:false,label:"WAITING APPROVAL"};
  if(s.includes("PROGRESS")||s.includes("ĐANG_LÀM")||s==="ACTIVE") return {id:L.IN_PROGRESS,held:false,label:"IN PROGRESS"};
  if(s.includes("VERIFY")||s.includes("REVIEW")) return {id:L.VERIFY,held:false,label:"VERIFY"};
  if(s==="READY") return {id:L.READY,held:false,label:"READY"};
  return {id:L.BACKLOG,held:false,label:"BACKLOG"};
}
function marker(id:string){return `[TASK_ID:${id}]`;}
function taskName(id:string,f:Fields){return `${id} — ${first(f,"TASK_NAME","CÔNG VIỆC","TITLE")||"Công việc"}`;}
function yes(v:string){return ["YES","TRUE","REQUIRED","CÓ","1"].includes(v.trim().toUpperCase());}
function splitSteps(raw:string){
  return raw.split(/\r?\n|\s*;\s*|\s*\|\s*/).map(x=>x.replace(/^[-*\d.)\s]+/,"").trim()).filter(Boolean).slice(0,20);
}
function stepsFor(f:Fields){
  const explicit=first(f,"SUBTASKS","EXECUTION_STEPS","STEPS","CHECKLIST","CÁC BƯỚC THỰC HIỆN");
  const steps=splitSteps(explicit);
  if(steps.length) return steps;
  const dep=first(f,"DEPENDENCY"), next=first(f,"NEXT_ACTION"), ev=evidence(f);
  return [
    dep?`Dependency PASS: ${dep}`:"",
    next?`Next action: ${next}`:"",
    ev?`Evidence-to-close: ${ev}`:"",
  ].filter(Boolean);
}
function description(id:string,f:Fields,stateLabel:string,held:boolean){
  const owner=first(f,"OWNER","ASSIGNEE","NGƯỜI THỰC HIỆN");
  const status=first(f,"STATUS","TRẠNG THÁI");
  const dependency=first(f,"DEPENDENCY");
  const next=first(f,"NEXT_ACTION");
  const blocker=first(f,"BLOCKER","VƯỚNG MẮC");
  const approvalId=first(f,"APPROVAL_ID","MÃ PHÊ DUYỆT");
  const due=first(f,"DUE_DATE","DEADLINE","HẠN HOÀN THÀNH");
  const ev=evidence(f);
  return [
    marker(id),"Nguồn chính thức: TASK-001","Trello: lớp phản chiếu thực thi, không phải SSOT.",
    "",`Trạng thái nguồn: ${status||"chưa có"}`,`Trạng thái Trello: ${stateLabel}`,
    held?"Cảnh báo: TASK-001 báo DONE nhưng thiếu evidence → NEED VERIFY.":"",
    `Owner/AI Agent: ${owner||"chưa gán"}`,`Deadline: ${due||"chưa có"}`,
    `Dependency: ${dependency||"không ghi nhận"}`,`Next Action: ${next||"chưa có"}`,
    `Blocker: ${blocker||"không"}`,`Approval ID: ${approvalId||"không"}`,
    `Evidence-to-close: ${ev||"CHƯA CÓ"}`,
    "","Quy tắc: không chuyển DONE nếu chưa có evidence; thay đổi phải có Activity Log/read-back phù hợp.",
  ].filter(x=>x!=="").join("\n");
}
async function ensureChecklist(cardId:string, steps:string[], done:boolean){
  if(!steps.length) return 0;
  const all=await api<Checklist[]>(`/cards/${cardId}/checklists`);
  let checklist=all.find(x=>x.name==="Các bước thực hiện");
  if(!checklist){
    checklist=await api<Checklist>(`/cards/${cardId}/checklists`,{method:"POST"}, {name:"Các bước thực hiện"});
  }
  let changed=0;
  for(const step of steps){
    const existing=checklist.checkItems.find(x=>x.name===step);
    if(!existing){
      await api(`/checklists/${checklist.id}/checkItems`,{method:"POST"},{name:step,pos:"bottom"});
      changed++; continue;
    }
    const should=done?"complete":"incomplete";
    if(existing.state!==should){
      await api(`/cards/${cardId}/checkItem/${existing.id}`,{method:"PUT"},{state:should});
      changed++;
    }
  }
  return changed;
}
export async function runTrelloExecutionMirror():Promise<TrelloMirrorResult>{
  const base:TrelloMirrorResult={ok:false,configured:trelloRuntimeConfigured(),scanned:0,created:0,updated:0,moved:0,checklists:0,heldVerify:0,errors:[]};
  if(!base.configured) return base;
  const container=getAdminContainer();
  const {data:rows,error}=await container.db.from("sync_records")
    .select("target_id,data,synced_at").eq("source_key","task-001").order("synced_at",{ascending:false});
  if(error) throw new Error(error.message);
  const latest=new Map<string,{target_id:string|null;data:Json}>();
  for(const row of rows??[]){
    const f=fields(row.data); const id=taskId(f,row.target_id);
    if(id&&!latest.has(id)) latest.set(id,{target_id:row.target_id,data:row.data});
  }
  const c=cfg();
  const cards=await api<Card[]>(`/boards/${c.board}/cards`,{}, {fields:"id,name,desc,idList",filter:"open"});
  const byTask=new Map<string,Card>();
  for(const card of cards){const m=card.desc.match(/\[TASK_ID:([^\]]+)\]/); if(m) byTask.set(m[1],card);}
  for(const [id,row] of latest){
    base.scanned++; const f=fields(row.data);
    const blocker=first(f,"BLOCKER","VƯỚNG MẮC");
    const approval=yes(first(f,"APPROVAL_REQUIRED","CẦN DUYỆT"))&&!first(f,"APPROVAL_ID","MÃ PHÊ DUYỆT");
    const ev=evidence(f);
    const state=listFor(first(f,"STATUS","TRẠNG THÁI"),blocker,approval,Boolean(ev));
    if(state.held) base.heldVerify++;
    const name=taskName(id,f), desc=description(id,f,state.label,state.held);
    try{
      let card=byTask.get(id);
      if(!card){
        card=await api<Card>(`/cards`,{method:"POST"},{idList:state.id,name,desc,pos:"bottom"});
        byTask.set(id,card); base.created++;
      }else{
        if(card.name!==name||card.desc!==desc){
          card=await api<Card>(`/cards/${card.id}`,{method:"PUT"},{name,desc}); base.updated++;
        }
        if(card.idList!==state.id){
          card=await api<Card>(`/cards/${card.id}`,{method:"PUT"},{idList:state.id}); base.moved++;
        }
      }
      base.checklists+=await ensureChecklist(card.id,stepsFor(f),state.label==="DONE");
    }catch(e){base.errors.push(`${id}: ${e instanceof Error?e.message:"unknown error"}`);}
  }
  base.ok=base.errors.length===0;
  await container.activityLog.record({
    agent:"Manager Agent",unit:"TCE Trello Mirror",
    message:`Trello mirror scanned=${base.scanned} created=${base.created} updated=${base.updated} moved=${base.moved} checklist_changes=${base.checklists} held_verify=${base.heldVerify} errors=${base.errors.length}.`,
    type:base.errors.length?"alert":"info",
  });
  return base;
}
