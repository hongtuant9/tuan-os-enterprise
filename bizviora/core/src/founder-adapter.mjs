import { createClient } from '@supabase/supabase-js';
import { createFounderGate } from './founder-auth.mjs';
import { createSupabaseDependencies } from './supabase-adapter.mjs';

/**
 * Founder authorization on isolated BIZVIORA staging only.
 * Uses the same validated staging project as Core and the caller's JWT.
 * Never uses service_role and never infers platform rights from identity.
 */
export function createStagingFounderGate(env=process.env) {
  const { verifyBearer } = createSupabaseDependencies(env);
  const { BIZVIORA_SUPABASE_URL:url, BIZVIORA_SUPABASE_ANON_KEY:anonKey }=env;
  const platformManagerRpc=async token=>{
    const db=createClient(url,anonKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{headers:{Authorization:'Bearer '+token}}
    });
    const {data,error}=await db.rpc('bv_is_platform_manager');
    if(error)throw Error('STAGING_FOUNDER_RPC_FAILED');
    return data === true;
  };
  return createFounderGate({verifyBearer,platformManagerRpc});
}
