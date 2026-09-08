import { executeBookingStateMachine } from "../src/server/ai-receptionist/booking-execution.ts";

let pass = 0;
const test = async (name, fn) => { try { await fn(); console.log("PASS", name); pass++; } catch (e) { console.error("FAIL", name, e?.message ?? e); } };
const base = { id: "b1", status: "draft", verificationStatus: "pending", idempotencyKey: "k1" };
function port({ createOk=true, createStatus=200, verifyOk=true }={}) {
  const updates=[];
  return { updates,
    update: async (_id, patch) => { updates.push(patch); },
    create: async () => createOk ? { ok:true,status:200,data:{uuid:"u1",code:"C1"},requestId:"r1" } : { ok:false,status:createStatus,data:null,requestId:"r2" },
    verify: async () => verifyOk ? { ok:true,bookingUuid:"u1",bookingCode:"C1",evidence:{source:"GET_ORDER"} } : { ok:false,evidence:{source:"GET_ORDER"} },
  };
}

await test("success_verified_confirmation", async()=>{ const p=port(); const r=await executeBookingStateMachine(base,p); if(!r.ok||r.state!=="verified"||!r.confirmationAllowed) throw new Error("bad success"); if(p.updates.map(x=>x.status).join(",")!=="checking,creating,created,verified") throw new Error("bad transitions"); });
await test("create_http_409_failed_safe", async()=>{ const p=port({createOk:false,createStatus:409}); const r=await executeBookingStateMachine(base,p); if(r.ok||r.state!=="failed_safe"||r.confirmationAllowed) throw new Error("unsafe failure"); if(!String(p.updates.at(-1).verification_evidence.reason).includes("409")) throw new Error("missing reason"); });
await test("create_http_500_failed_safe", async()=>{ const p=port({createOk:false,createStatus:500}); const r=await executeBookingStateMachine(base,p); if(r.state!=="failed_safe") throw new Error("not failed safe"); });
await test("verify_fail_failed_safe", async()=>{ const p=port({verifyOk:false}); const r=await executeBookingStateMachine(base,p); if(r.ok||r.state!=="failed_safe"||r.confirmationAllowed) throw new Error("verify fail unsafe"); if(p.updates.map(x=>x.status).join(",")!=="checking,creating,created,failed_safe") throw new Error("bad verify flow"); });
await test("create_throw_failed_safe", async()=>{ const p=port(); p.create=async()=>{throw new Error("API_TIMEOUT")}; const r=await executeBookingStateMachine(base,p); if(r.state!=="failed_safe"||r.reason!=="API_TIMEOUT") throw new Error("timeout not contained"); });
await test("update_throw_no_confirmation", async()=>{ const p=port(); let n=0; p.update=async()=>{n++; if(n===2) throw new Error("DB_WRITE_FAILED")}; const r=await executeBookingStateMachine(base,p); if(r.confirmationAllowed||r.ok) throw new Error("confirmation leak"); });
await test("verified_start_rejected", async()=>{ const p=port(); const r=await executeBookingStateMachine({...base,status:"verified",verificationStatus:"verified"},p); if(r.ok||r.confirmationAllowed) throw new Error("reexecution unsafe"); });
console.log(`TOTAL ${pass}/7`); if(pass!==7) process.exit(1);
