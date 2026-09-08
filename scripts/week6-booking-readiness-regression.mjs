import assert from "node:assert/strict";
import { evaluateBookingReadiness } from "../src/server/ai-receptionist/booking-readiness.ts";
import { buildConfirmationDraft } from "../src/server/ai-receptionist/booking-confirmation.ts";

const base={guestContact:"0901",roomClassId:"HP000001",quotedPrice:610000,priceSource:"MASTER_03_VERIFIED",firstAvailabilityEvidence:{available:1},writeEnabled:false};
const cases=[];
function run(name,fn){try{fn();console.log("PASS",name);cases.push(true)}catch(e){console.error("FAIL",name,e);cases.push(false)}}
run("write_gate_blocks",()=>assert.deepEqual(evaluateBookingReadiness(base).blockers,["a2_write_gate_off"]));
run("ready_when_all_true",()=>assert.equal(evaluateBookingReadiness({...base,writeEnabled:true}).readyForPilotWrite,true));
run("missing_price_blocks",()=>assert.ok(evaluateBookingReadiness({...base,quotedPrice:null}).blockers.includes("missing_verified_price")));
run("missing_evidence_blocks",()=>assert.ok(evaluateBookingReadiness({...base,firstAvailabilityEvidence:null}).blockers.includes("missing_first_availability_evidence")));
run("confirmation_rejects_unverified",()=>assert.throws(()=>buildConfirmationDraft({status:"created",verificationStatus:"pending",bookingCode:"BK1",guestName:"Test",checkIn:"2026-09-10",checkOut:"2026-09-11",roomClassName:"Double",roomCount:1,quotedPrice:610000})));
run("confirmation_requires_code",()=>assert.throws(()=>buildConfirmationDraft({status:"verified",verificationStatus:"verified",bookingCode:null,guestName:"Test",checkIn:"2026-09-10",checkOut:"2026-09-11",roomClassName:"Double",roomCount:1,quotedPrice:610000})));
run("confirmation_verified",()=>assert.match(buildConfirmationDraft({status:"verified",verificationStatus:"verified",bookingCode:"BK1",guestName:"Test",checkIn:"2026-09-10",checkOut:"2026-09-11",roomClassName:"Double",roomCount:1,quotedPrice:610000}),/Bản nháp nội bộ/));
console.log(`TOTAL ${cases.filter(Boolean).length}/${cases.length}`); if(cases.some(x=>!x)) process.exit(1);
