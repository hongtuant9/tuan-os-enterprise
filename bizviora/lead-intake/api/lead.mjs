// BIZVIORA lead intake — isolated review scaffold. No public deployment.
// Host as server-side route only. Never bundle this file into static Render site.
import { createHash, randomUUID } from 'node:crypto';

const clean = (v, max = 200) => typeof v === 'string'
  ? v.trim().normalize('NFC').slice(0, max) : '';
const safeSheetValue = v => /^[=+@\-\t\r]/.test(v) ? "'" + v : v;
const emailValid = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const phoneValid = v => /^[+0-9() .\-]{8,22}$/.test(v);

export function validateLead(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {ok:false,reason:'invalid_body'};
  const business = clean(data.business,120), contact = clean(data.contact,120);
  const phone = clean(data.phone,22), email = clean(data.email,160).toLowerCase();
  const kind = clean(data.kind,50), pain = clean(data.pain,1000);
  if (!business || !contact || !pain || !['homestay','small_hotel','cafe','restaurant','other'].includes(kind))
    return {ok:false,reason:'required_fields'};
  if ((!phone || !phoneValid(phone)) && (!email || !emailValid(email)))
    return {ok:false,reason:'valid_contact_required'};
  if (data.consent !== true || data.consentVersion !== 'bizviora-lead-v1')
    return {ok:false,reason:'consent_required'};
  if (clean(data.website,120)) return {ok:false,reason:'spam_detected'}; // honeypot
  const source = clean(data.source,60) || 'landing';
  const out = {business,contact,phone:phoneValid(phone)?phone:'',email:emailValid(email)?email:'',kind,pain,source,
    utmSource:clean(data.utmSource,80),utmMedium:clean(data.utmMedium,80),
    utmCampaign:clean(data.utmCampaign,80),landingUrl:clean(data.landingUrl,200)};
  for (const k of Object.keys(out)) out[k] = safeSheetValue(out[k]);
  return {ok:true,lead:out};
}

// Injection required for tests and production adapter; adapter must append to
// owner-controlled Sheets using server-only credentials, never return PII in logs.
export function createLeadHandler({appendLead,rateLimit,now=()=>new Date(),id=()=>randomUUID()}) {
  if (typeof appendLead!=='function' || typeof rateLimit!=='function') throw new Error('secure_adapters_required');
  return async function leadHandler(req) {
    if (req.method!=='POST') return {status:405,body:{error:'method_not_allowed'}};
    if (!req.isJson || req.bytes>8000) return {status:413,body:{error:'invalid_payload'}};
    if (!rateLimit(req.rateKey)) return {status:429,body:{error:'rate_limited'}};
    const parsed=validateLead(req.body);
    if (!parsed.ok) return {status:400,body:{error:parsed.reason}};
    const ts=now().toISOString(), leadId=id();
    const dedupe=createHash('sha256').update([parsed.lead.email,parsed.lead.phone,parsed.lead.business].join('|')).digest('hex');
    try {
      await appendLead({leadId,timestamp:ts,consentTimestamp:ts,consentVersion:'bizviora-lead-v1',dedupe,...parsed.lead});
      return {status:201,body:{accepted:true,leadId}};
    } catch {
      return {status:503,body:{error:'lead_service_unavailable'}};
    }
  };
}
