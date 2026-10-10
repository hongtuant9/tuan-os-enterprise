/**
 * BIZVIORA Unified Inbox — deterministic, SYNTHETIC ONLY.
 * No DB, secrets, provider calls, production authorization or messages sent.
 * AUTHENTICATED_PROVIDER means a trusted server-side adapter validated the claim.
 * Browser input must NEVER be allowed to set it in a real implementation.
 */
export const LINK = Object.freeze({
  VERIFIED: "AUTO_VERIFIED",
  REVIEW: "MANUAL_REVIEW",
  UNLINKED: "UNASSIGNED",
  REJECTED: "REJECTED"
});
const same=(a,b)=>String(a??"")===String(b??"");
const approvedSource=new Set(["OTA_API","OTA_AUTHORIZED_BROWSER"]);
export function matchBooking(event, data) {
  if (!event?.tenantId || !event?.propertyId) return {status:LINK.REJECTED,reason:"MISSING_TENANT_OR_PROPERTY"};
  const visible=(data.bookings||[]).filter(b=>same(b.tenantId,event.tenantId) && same(b.propertyId,event.propertyId));
  if (!visible.length) return {status:LINK.UNLINKED,reason:"NO_PROPERTY_BOOKINGS"};
  // Provider assertions are auto-match eligible ONLY after backend adapter verification.
  if (event.provider && event.providerBookingNumber) {
    const found=visible.filter(b=>same(b.provider,event.provider) && same(b.providerBookingNumber,event.providerBookingNumber));
    if (found.length===1 && event.providerTrust==="AUTHENTICATED_PROVIDER" &&
        approvedSource.has(event.transport) && found[0].sourceVerified===true)
      return {status:LINK.VERIFIED,bookingId:found[0].id,reason:"VERIFIED_PROVIDER_COMPOSITE"};
    if (found.length>0) return {status:LINK.REVIEW,reason:"PROVIDER_REFERENCE_NOT_AUTHENTICATED",candidateIds:found.map(b=>b.id)};
  }
  // Only verified identity bindings are eligible, and only if ONE booking exists for that customer
  // in the selected property. Multiple stays must never be merged based on contact alone.
  if (event.identityKey) {
    const keys=(data.identities||[]).filter(i=>same(i.tenantId,event.tenantId) &&
      same(i.propertyId,event.propertyId) && same(i.channel,event.channel) &&
      same(i.identityKey,event.identityKey) && i.verified===true);
    const customerIds=new Set(keys.map(i=>i.customerId));
    if(customerIds.size>1) return {status:LINK.REVIEW,reason:"IDENTITY_CONFLICT"};
    if(customerIds.size===1){
      const options=visible.filter(b=>customerIds.has(b.customerId));
      if(options.length===1 && options[0].sourceVerified===true)
        return {status:LINK.VERIFIED,bookingId:options[0].id,reason:"VERIFIED_IDENTITY_SINGLE_STAY"};
      if(options.length>0) return {status:LINK.REVIEW,reason:"MULTIPLE_OR_UNVERIFIED_STAYS",candidateIds:options.map(x=>x.id)};
    }
  }
  // User self-reported reference is not a verified identity/authentication proof.
  if(event.claimedBookingNumber){
    const options=visible.filter(b=>same(b.providerBookingNumber,event.claimedBookingNumber));
    if(options.length) return {status:LINK.REVIEW,reason:"SELF_REPORTED_BOOKING_NEEDS_VERIFICATION",candidateIds:options.map(b=>b.id)};
  }
  return {status:LINK.UNLINKED,reason:"INSUFFICIENT_EVIDENCE"};
}
export function canView(tenantId, actor){return Boolean(actor&&same(actor.tenantId,tenantId)&&actor.role);}
export function inboxForActor(actor,data,bookingId){
  if(!actor) return [];
  const allowed=(data.bookings||[]).filter(b=>canView(b.tenantId,actor));
  if(bookingId && !allowed.some(b=>b.id===bookingId)) return [];
  return (data.messages||[]).filter(m=>canView(m.tenantId,actor) &&
    (!bookingId||m.bookingId===bookingId));
}
export function manualLink(event, booking, actor, note){
  if(!event || !booking || !canView(event.tenantId,actor) ||
      !same(booking.tenantId,event.tenantId) || !same(booking.propertyId,event.propertyId))
    return {ok:false,reason:"TENANT_OR_PROPERTY_MISMATCH"};
  if(!["owner","admin","manager"].includes(actor.role)) return {ok:false,reason:"ROLE_DENIED"};
  if(!String(note||"").trim())return {ok:false,reason:"AUDIT_REASON_REQUIRED"};
  return {ok:true,bookingId:booking.id,audit:{action:"MANUAL_LINK",tenantId:event.tenantId,
    propertyId:event.propertyId,bookingId:booking.id,messageId:event.id,actorId:actor.id,reason:note.trim()}};
}
export function manualUnlink(event,actor,note){
  if(!event||!canView(event.tenantId,actor)||!["owner","admin","manager"].includes(actor.role))
    return {ok:false,reason:"ROLE_OR_TENANT_DENIED"};
  if(!String(note||"").trim())return {ok:false,reason:"AUDIT_REASON_REQUIRED"};
  return {ok:true,audit:{action:"MANUAL_UNLINK",tenantId:event.tenantId,propertyId:event.propertyId,
    messageId:event.id,actorId:actor.id,reason:note.trim()}};
}
// Only exact provider message IDs or a VERIFIED bridge correlation may collapse observations.
// Same content at same time across unrelated channels is never safe to deduplicate.
export function deduplicateEvents(events){
  const seen=new Map();const result=[];
  for(const event of events){
    const providerKey=event.providerMessageId ?
      [event.tenantId,event.channel,event.channelAccountId??"",event.providerThreadId??"",event.providerMessageId].join("|"):null;
    const bridgeKey=event.bridgeVerified===true && event.bridgeCorrelationId ?
      ["bridge",event.tenantId,event.bridgeCorrelationId].join("|"):null;
    const key=bridgeKey||providerKey;
    const old=key?seen.get(key):undefined;
    if(old){
      old.provenance=[...new Set([...(old.provenance||[old.channel]),event.channel])];
      continue;
    }
    const copy={...event,provenance:[event.channel]};
    result.push(copy);
    if(key)seen.set(key,copy);
  }
  return result;
}
