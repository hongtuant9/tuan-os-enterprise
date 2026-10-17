/**
 * BIZVIORA DB target gate. Neither target permits deployment to customer production.
 * Old staging behaviour is preserved. New BIZVIORA 2.0 QA is isolated, local and read-only.
 * Never accept an arbitrary Supabase ref/URL from an API request.
 */
export const LEGACY_STAGING_REF='oxakhhpyvvymujiwuvnm';
export const BIZVIORA_V2_QA_REF='yohtwbdfcaeibwsupqyg';
const FORBIDDEN_REFS=new Set(['mmxgthzafjoienokyplw','zydtetnvguvlhpkjlvqi']);
const QA_ACK='BIZVIORA_V2_SYNTHETIC_READ_ONLY';

export function resolveDatabaseTarget(env=process.env) {
  if(env.BIZVIORA_STAGING_ACK!=='STAGING_ONLY')
    throw Error('STAGING_ACK_REQUIRED');
  const ref=env.BIZVIORA_STAGING_PROJECT_REF;
  const url=env.BIZVIORA_SUPABASE_URL;
  const publishableKey=env.BIZVIORA_SUPABASE_ANON_KEY;
  if(!url||!publishableKey)throw Error('STAGING_AUTH_CONFIG_REQUIRED');
  if(FORBIDDEN_REFS.has(ref))throw Error('NON_STAGING_PROJECT_FORBIDDEN');
  let parsed;
  try{parsed=new URL(url);}catch{throw Error('INVALID_STAGING_URL');}
  if(parsed.protocol!=='https:')throw Error('HTTPS_STAGING_REQUIRED');
  if(parsed.hostname!==ref+'.supabase.co')throw Error('STAGING_REF_MISMATCH');
  if(parsed.username||parsed.password||parsed.port||parsed.pathname!=='/'||
      parsed.search||parsed.hash)throw Error('INVALID_STAGING_URL');

  if(ref===LEGACY_STAGING_REF) {
    if(env.BIZVIORA_V2_QA_ACK||env.BIZVIORA_V2_QA_MODE)
      throw Error('MIXED_DATABASE_ENV_FORBIDDEN');
    return Object.freeze({mode:'LEGACY_STAGING',projectRef:ref,url,readOnly:false});
  }
  if(ref!==BIZVIORA_V2_QA_REF)throw Error('APPROVED_STAGING_REF_REQUIRED');

  // No public Render ingress, no production, no admin credentials, no outbound writes.
  if(env.BIZVIORA_V2_QA_ACK!==QA_ACK||
      env.BIZVIORA_V2_QA_MODE!=='LOCAL_READ_ONLY'||
      env.NODE_ENV==='production'||
      (env.BIZVIORA_HOSTING_TARGET&&env.BIZVIORA_HOSTING_TARGET!=='LOCAL_STAGING')||
      env.BIZVIORA_RENDER_PUBLIC_STAGING_ACK||
      env.SUPABASE_SERVICE_ROLE_KEY||
      env.BIZVIORA_SUPABASE_SERVICE_ROLE_KEY)
    throw Error('V2_QA_ISOLATION_REQUIRED');
  return Object.freeze({mode:'V2_SYNTHETIC_QA',projectRef:ref,url,readOnly:true});
}
