import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const PROJECT='oxakhhpyvvymujiwuvnm';
const BASE='https://'+PROJECT+'.supabase.co';
const TUAN_OS_SLUG='tuan-os-enterprise-001';
const ALLOWED_ROLES=new Set(['owner','admin','manager','staff']);
let clientPromise;

export function customerClient(){
  if (!clientPromise) clientPromise=(async()=>{
    const response=await fetch(BASE+'/functions/v1/bv-public-config',{cache:'no-store'});
    if(!response.ok) throw Error('STAGING_CONFIG_UNAVAILABLE');
    const c=await response.json();
    if(c.supabaseUrl!==BASE||typeof c.publishableKey!=='string'||c.publishableKey.length<25)
      throw Error('STAGING_CONFIG_INVALID');
    return createClient(BASE,c.publishableKey,{
      auth:{persistSession:true,storage:sessionStorage,autoRefreshToken:true,detectSessionInUrl:true}
    });
  })();
  return clientPromise;
}
export async function authorizedCustomer(client){
  const {data,error}=await client.auth.getUser(); 
  if(error||!data?.user) return {ok:false,reason:'LOGIN_REQUIRED'};
  const user=data.user;
  const {data:tenant,error:te}=await client.from('bv_tenants')
    .select('id,slug,name').eq('slug',TUAN_OS_SLUG).maybeSingle();
  if(te||!tenant||tenant.slug!==TUAN_OS_SLUG) return {ok:false,reason:'TENANT_DENIED'};
  const {data:member,error:me}=await client.from('bv_memberships')
    .select('tenant_id,user_id,role').eq('user_id',user.id)
    .eq('tenant_id',tenant.id).maybeSingle();
  if(me||!member||member.user_id!==user.id||member.tenant_id!==tenant.id||
      !ALLOWED_ROLES.has(member.role))
    return {ok:false,reason:'TENANT_DENIED'};
  return {ok:true,user,tenant,role:member.role};
}

export async function isolatedRecoveryClient(){
  // Recovery must never treat an existing business login as proof of a valid reset link.
  const response=await fetch(BASE+'/functions/v1/bv-public-config',{cache:'no-store'});
  if(!response.ok)throw Error('STAGING_CONFIG_UNAVAILABLE');
  const config=await response.json();
  if(config.supabaseUrl!==BASE||typeof config.publishableKey!=='string')
    throw Error('STAGING_CONFIG_INVALID');
  return createClient(BASE,config.publishableKey,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,
      storageKey:'bv-staging-recovery-only'}
  });
}
