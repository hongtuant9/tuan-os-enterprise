// BIZVIORA settings live-only data boundary. Not enabled in the synthetic UI.
// Import only after real staging JWT HTTP E2E and explicit QA rollout approval.
// No localStorage, mock response, or synthetic fallback.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class SettingsGateError extends Error {
 constructor(code){super(code);this.name='SettingsGateError';this.code=code;}
}
export async function loadVerifiedSettings({apiOrigin,tenantId,getAccessToken,fetchImpl=fetch,signal}){
 if(!uuid.test(tenantId||''))throw new SettingsGateError('TENANT_CONTEXT_REQUIRED');
 if(!apiOrigin||new URL(apiOrigin).protocol!=='https:')throw new SettingsGateError('HTTPS_API_REQUIRED');
 if(typeof getAccessToken!=='function')throw new SettingsGateError('AUTH_PROVIDER_REQUIRED');
 const token=await getAccessToken();
 if(typeof token!=='string'||!token.trim())throw new SettingsGateError('AUTH_REQUIRED');
 const url=new URL('/v1/tenant-settings',apiOrigin);
 url.searchParams.set('tenantId',tenantId);
 let response;
 try {
  response=await fetchImpl(url.toString(),{
   method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},
   cache:'no-store',credentials:'omit',signal
  });
 } catch {throw new SettingsGateError('SETTINGS_API_UNAVAILABLE');}
 if(response.status===401)throw new SettingsGateError('AUTH_REQUIRED');
 if(response.status===403)throw new SettingsGateError('TENANT_ACCESS_DENIED');
 if(!response.ok)throw new SettingsGateError('SETTINGS_API_UNAVAILABLE');
 let data;
 try {data=await response.json();} catch {throw new SettingsGateError('SETTINGS_INVALID_RESPONSE');}
 if(data?.tenantId!==tenantId||data?.source!=='BIZVIORA_CORE_VERIFIED_CONTEXT'||
    data?.status!=='READ_ONLY_QA'||data?.membership?.verified!==true||
    !data?.profile?.id||data.profile.id!==tenantId||
    !Array.isArray(data.businessUnits)||!Array.isArray(data.properties)||
    data.properties.some(p=>!data.businessUnits.some(u=>u.id===p.businessUnitId))||
    data?.sections?.knowledge?.status!=='NOT_CONFIGURED'||
    data?.capabilities?.profileWrite!==false||
    data?.capabilities?.propertyWrite!==false)
  throw new SettingsGateError('SETTINGS_SCOPE_OR_SOURCE_INVALID');
 return Object.freeze(data);
}
