import test from "node:test";
import assert from "node:assert/strict";
import {matchBooking,LINK,canView,inboxForActor,manualLink,manualUnlink,deduplicateEvents} from "./matcher.mjs";
import {ACTORS,BOOKINGS,IDENTITIES,DATA,REVIEW_CASES} from "./fixtures.mjs";
const base={bookings:BOOKINGS,identities:IDENTITIES};
const ota=(extra={})=>({tenantId:"tenant-A",propertyId:"lavender-demo",provider:"Booking.com",providerBookingNumber:"D1042",providerTrust:"AUTHENTICATED_PROVIDER",transport:"OTA_API",channel:"Booking.com",...extra});
const msg=(x={})=>({id:"synthetic-review",tenantId:"tenant-A",propertyId:"lavender-demo",channel:"Email",...x});
test("verified authenticated OTA composite auto-links correct booking",()=>{
  assert.deepEqual(matchBooking(ota(),base),{status:LINK.VERIFIED,bookingId:"booking-A1",reason:"VERIFIED_PROVIDER_COMPOSITE"});
});
test("same external provider code across two tenants stays tenant-scoped",()=>{
  assert.equal(matchBooking(ota({tenantId:"tenant-B",propertyId:"property-B"}),base).bookingId,"booking-B1");
});
test("wrong property cannot match booking even when code and name collide",()=>assert.equal(matchBooking(ota({propertyId:"property-B"}),base).status,LINK.UNLINKED));
test("provider claim without trusted server adapter only suggests review",()=>assert.equal(matchBooking(ota({providerTrust:"SELF_REPORTED"}),base).status,LINK.REVIEW));
test("provider authenticity cannot be set using fake transport",()=>assert.equal(matchBooking(ota({transport:"BROWSER_USER_INPUT"}),base).status,LINK.REVIEW));
test("provider booking code claimed by email requires review",()=>assert.equal(matchBooking(msg({claimedBookingNumber:"D1042"}),base).status,LINK.REVIEW));
test("two stays for verified WhatsApp identity do not auto-merge",()=>assert.equal(matchBooking(msg({channel:"WhatsApp",identityKey:"wa-verified-A"}),base).reason,"MULTIPLE_OR_UNVERIFIED_STAYS"));
test("single-booking verified Zalo identity safely auto-links",()=>assert.equal(matchBooking(msg({channel:"Zalo",identityKey:"zalo-guest2"}),base).bookingId,"booking-A3"));
test("unverified email alias never automatically links",()=>assert.equal(matchBooking(msg({channel:"Email",identityKey:"shared-email"}),base).status,LINK.UNLINKED));
test("name and check-in similarity never links",()=>assert.equal(matchBooking(msg({claimedName:"Khách A (demo)",claimedCheckIn:"2026-10-22"}),base).status,LINK.UNLINKED));
test("no tenant supplied is rejected",()=>assert.equal(matchBooking(msg({tenantId:null}),base).status,LINK.REJECTED));
test("unknown property has no matching bookings",()=>assert.equal(matchBooking(msg({propertyId:"nonexistent"}),base).status,LINK.UNLINKED));
test("booking for another tenant is not visible",()=>assert.equal(inboxForActor(ACTORS.ownerA,DATA,"booking-B1").length,0));
test("tenant A inbox never exposes tenant B data",()=>assert.ok(inboxForActor(ACTORS.ownerA,DATA).every(m=>m.tenantId==="tenant-A")));
test("staff A only sees tenant A",()=>assert.equal(inboxForActor(ACTORS.staffA,DATA).some(m=>m.id==="m9"),false));
test("tenant B sees own booking only",()=>assert.deepEqual(inboxForActor(ACTORS.ownerB,DATA).map(m=>m.id),["m9"]));
test("booking A1 timeline includes OTA WhatsApp Email and Facebook",()=>assert.deepEqual([...new Set(inboxForActor(ACTORS.ownerA,DATA,"booking-A1").map(m=>m.channel))].sort(),["Booking.com","Email","Facebook","WhatsApp"]));
test("second stay of same customer remains separate",()=>assert.deepEqual(inboxForActor(ACTORS.ownerA,DATA,"booking-A2").map(m=>m.id),["m7"]));
test("same-name guest with same dates has isolated booking",()=>assert.deepEqual(inboxForActor(ACTORS.ownerA,DATA,"booking-A3").map(m=>m.id),["m8"]));
test("unassigned inquiry remains outside booking A1",()=>assert.ok(!inboxForActor(ACTORS.ownerA,DATA,"booking-A1").some(m=>m.id==="m10")));
test("manual cross-tenant link denied even for owner",()=>assert.equal(manualLink(msg(),BOOKINGS[3],ACTORS.ownerA,"Checked").ok,false));
test("manual cross-property link denied",()=>assert.equal(manualLink(msg({propertyId:"property-B"}),BOOKINGS[0],ACTORS.ownerA,"Checked").ok,false));
test("staff cannot manually link booking",()=>assert.equal(manualLink(msg(),BOOKINGS[0],ACTORS.staffA,"Checked").reason,"ROLE_DENIED"));
test("manual link requires audit reason",()=>assert.equal(manualLink(msg(),BOOKINGS[0],ACTORS.ownerA,"").reason,"AUDIT_REASON_REQUIRED"));
test("approved manual link is auditable",()=>assert.deepEqual(manualLink(msg(),BOOKINGS[0],ACTORS.ownerA,"Verified by booking receipt").audit.action,"MANUAL_LINK"));
test("manual unlink denied to staff",()=>assert.equal(manualUnlink(msg(),ACTORS.staffA,"Check").ok,false));
test("manual unlink requires reason",()=>assert.equal(manualUnlink(msg(),ACTORS.ownerA,"").ok,false));
test("manual unlink approved with audit",()=>assert.equal(manualUnlink(msg(),ACTORS.ownerA,"Wrong booking").audit.action,"MANUAL_UNLINK"));
test("duplicate provider message is one bubble with provenance",()=>{
 const x=msg({channel:"Booking.com",providerMessageId:"external-1",providerThreadId:"thread-1"});
 assert.equal(deduplicateEvents([x,{...x,id:"x2"}]).length,1);
});
test("identical content in separate channels NEVER dedupes without verified bridge",()=>{
 const x=msg({text:"Same",channel:"Email",providerMessageId:"id-1"});
 const y=msg({text:"Same",channel:"WhatsApp",providerMessageId:"id-2"});
 assert.equal(deduplicateEvents([x,y]).length,2);
});
test("verified bridge correlation merges observations preserving both sources",()=>{
 const x=msg({channel:"Email",bridgeCorrelationId:"relay-1",bridgeVerified:true});
 const y=msg({channel:"Booking.com",bridgeCorrelationId:"relay-1",bridgeVerified:true});
 const rows=deduplicateEvents([x,y]);assert.equal(rows.length,1);assert.deepEqual(rows[0].provenance,["Email","Booking.com"]);
});
test("unverified bridge correlation never merges messages",()=>{
 const x=msg({channel:"Email",bridgeCorrelationId:"relay-1",bridgeVerified:false});
 const y=msg({channel:"Booking.com",bridgeCorrelationId:"relay-1",bridgeVerified:false});
 assert.equal(deduplicateEvents([x,y]).length,2);
});
test("source tags and native/email sync distinction exist for each fixture",()=>{
 assert.ok(DATA.messages.every(m=>m.channel && m.status));
 assert.equal(DATA.messages.find(m=>m.id==="m6").status,"EMAIL_SENT_UNVERIFIED");
});
test("each review case returns nonempty explicit status",()=>{
 assert.equal(REVIEW_CASES.length,6);
 for(const c of REVIEW_CASES)assert.ok(matchBooking(c,base).status);
});
test("wrong actor tenant id denied",()=>assert.equal(canView("tenant-B",ACTORS.ownerA),false));
