import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const path = process.argv[2];
if (!path) { console.error('STAGING_ENV_HOLD: provide explicit env path; never use original production env'); process.exit(2); }
const text = readFileSync(path, 'utf8');
const entries = Object.fromEntries(text.split(/\r?\n/).filter(s=>s && !/^\s*#/.test(s)).map(s=>{const at=s.indexOf('=');return at<0?['',s]:[s.slice(0,at).trim(),s.slice(at+1).trim().replace(/^["']|["']$/g,'')]}));
const failures=[];
const must=(ok,reason)=>{if(!ok)failures.push(reason)};
must(entries.TUAN_OS_UI_REVIEW_MODE==='synthetic','UI_REVIEW_MODE_REQUIRED');
must(entries.TUAN_OS_DISABLE_EXTERNAL_INTEGRATIONS==='true','DISABLE_EXTERNAL_INTEGRATIONS_REQUIRED');
must(entries.TUAN_OS_DISABLE_WRITES==='true','DISABLE_WRITES_REQUIRED');
const keys=Object.keys(entries).filter(Boolean);
for(const key of keys)if(/SERVICE_ROLE|SECRET|PASSWORD|TOKEN|PRIVATE_KEY|DATABASE_URL|API_KEY/i.test(key))failures.push('PRIVILEGED_OR_EXTERNAL_KEY_PRESENT:'+key);
for(const [key,value] of Object.entries(entries)){
 if(/SUPABASE_URL/i.test(key)) must(!/mmxgthzafjoienokyplw|zydtetnvguvlhpkjlvqi/.test(value),'PRODUCTION_SUPABASE_REF_DENIED:'+key);
 if(/URL|HOST|ORIGIN|ENDPOINT/.test(key))must(!/bizviora\.com|tuan-os-enterprise.*onrender\.com/.test(value),'PRODUCTION_ORIGIN_DENIED:'+key);
}
must(!entries.NEXT_PUBLIC_SUPABASE_URL && !entries.NEXT_PUBLIC_SUPABASE_ANON_KEY,'NO_REAL_AUTH_IN_SYNTHETIC_REVIEW');
if(failures.length){console.log('STAGING_ENV_HOLD',failures.join(','));process.exit(1)}
console.log('STAGING_CONFIG_STATIC_GATE_PASS: NO REAL AUTH / NO SECRETS. Runtime egress isolation still required.');
