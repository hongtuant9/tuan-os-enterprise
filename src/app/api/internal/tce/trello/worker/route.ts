import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runTrelloExecutionMirror } from "@/server/trello/execution-mirror";
import { trelloExecutionMirrorStatus } from "@/server/agents/execution-governance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function workerToken(): string | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) return null;
  return createHash("sha256").update(`${secret}:tce-trello-worker-v1`).digest("hex");
}
function authorized(req: NextRequest): boolean {
  const expected=workerToken();
  const provided=req.headers.get("x-tce-trello-worker-token")?.trim();
  if(!expected||!provided) return false;
  const a=Buffer.from(expected), b=Buffer.from(provided);
  return a.length===b.length && timingSafeEqual(a,b);
}
export async function POST(req: NextRequest){
  if(!authorized(req)) return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  if(process.env.TCE_COMPANY_AUTOPILOT_ENABLED?.trim().toLowerCase()==="false" || process.env.TCE_TRELLO_WORKER_ENABLED?.trim().toLowerCase()==="false"){
    return NextResponse.json({ok:true,skipped:"worker_disabled"});
  }
  if(trelloExecutionMirrorStatus()!=="ACTIVE"){
    return NextResponse.json({ok:true,skipped:"HOLD_NO_RUNTIME_CREDENTIALS",configured:false});
  }
  try{return NextResponse.json(await runTrelloExecutionMirror());}
  catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Trello worker error"},{status:500});}
}
