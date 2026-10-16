import { ApiError, requireUuid, requireMembership, validateTaskInput } from './access.mjs';
import { validateRegistration } from './registration.mjs';

const respond=(status,body)=>new Response(JSON.stringify(body),{
  status,headers:{'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
async function readBody(request) {
  if (Number(request.headers.get('content-length')||0)>16384)
    throw new ApiError(413,'PAYLOAD_TOO_LARGE');
  if (!request.body) throw new ApiError(400,'INVALID_BODY');
  const reader=request.body.getReader();
  const chunks=[];let length=0;
  while(true) {
    const {done,value}=await reader.read();if(done)break;
    length+=value.byteLength;
    if(length>16384){await reader.cancel();throw new ApiError(413,'PAYLOAD_TOO_LARGE');}
    chunks.push(Buffer.from(value));
  }
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch {throw new ApiError(400,'INVALID_JSON');}
}
/** Chỉ chấp nhận actor từ xác minh token phía máy chủ và membership do DB/RLS trả về. */
export function createApi({verifyBearer,repository,requireFounder}) {
  if(typeof verifyBearer!=='function'||typeof repository!=='function')
    throw new Error('AUTH_AND_REPOSITORY_REQUIRED');
  const handleInternal = async function handle(request) {
    try{
      const {pathname,searchParams}=new URL(request.url);
      if(pathname==='/health' && request.method==='GET')
        return respond(200,{status:'UP',product:'BIZVIORA Core',scope:'STAGING_ONLY',autoSend:false,bookingWrite:false});
      if(!pathname.startsWith('/v1/'))throw new ApiError(404,'NOT_FOUND');
      if(!['GET','POST'].includes(request.method))throw new ApiError(405,'METHOD_NOT_ALLOWED');
      const token=/^Bearer ([A-Za-z0-9._~-]{12,4096})$/.exec(request.headers.get('authorization')||'')?.[1];
      if(!token)throw new ApiError(401,'AUTH_REQUIRED');
      const user=await verifyBearer(token);
      if(!user?.id)throw new ApiError(401,'AUTH_INVALID');
      // Read-only Founder identity endpoint; no tenant context and no privilege mutation.
      if(pathname==='/v1/founder/access') {
        if(request.method!=='GET')throw new ApiError(405,'ACTION_NOT_ENABLED');
        if(typeof requireFounder!=='function')throw new ApiError(503,'FOUNDER_GATE_NOT_CONFIGURED');
        const founder=await requireFounder(token,user);
        if(founder?.userId!==user.id.toLowerCase() || founder.platformManager!==true)
          throw new ApiError(403,'FOUNDER_ACCESS_DENIED');
        return respond(200,{platformManager:true,scope:'STAGING_ONLY'});
      }
      if(pathname==='/v1/registration') {
        const repo=repository(token);
        if(request.method==='GET')
          return respond(200,{data:await repo.myRegistration(user.id)});
        const payload=await readBody(request);
        return respond(201,{data:await repo.createRegistration(user.id,validateRegistration(payload))});
      }
      const payload=request.method==='POST'?await readBody(request):null;
      const tenantId=requireUuid(request.method==='GET'?searchParams.get('tenantId'):payload?.tenantId,'tenant_id');
      const repo=repository(token);
      const membership=await repo.membership({tenantId,userId:user.id});
      const requestApproval=pathname==='/v1/approvals' && request.method==='POST';
      const actor=requireMembership({userId:user.id,tenantId,membership,
        minRole:request.method==='POST' && !requestApproval?'manager':'staff'});
      if(pathname==='/v1/context'&&request.method==='GET') {
        const data=await repo.context(actor);
        return respond(200,{tenant:data.tenant,businessUnits:data.businessUnits,properties:data.properties,role:actor.role});
      }
      if(pathname==='/v1/tasks'&&request.method==='GET')
        return respond(200,{tenantId,data:await repo.tasks(actor)});
      if(pathname==='/v1/tasks'&&request.method==='POST')
        return respond(201,{data:await repo.createTask(actor,validateTaskInput(payload))});
      if(pathname==='/v1/approvals'&&request.method==='GET')
        return respond(200,{tenantId,data:await repo.approvals(actor),writesEnabled:true});
      if(pathname==='/v1/approvals' && request.method==='POST') {
        const taskId=payload.taskId==null?null:requireUuid(payload.taskId,'task_id');
        return respond(201,{data:await repo.requestApproval(actor,{taskId})});
      }
      if(pathname==='/v1/approvals/decision' && request.method==='POST') {
        const approvalId=requireUuid(payload.approvalId,'approval_id');
        if(!['APPROVED','REJECTED'].includes(payload.decision))throw new ApiError(400,'INVALID_DECISION');
        return respond(200,{data:await repo.decideApproval(actor,{approvalId,decision:payload.decision})});
      }
      // Chưa mở thay đổi phê duyệt, tự gửi tin, tài chính chủ sở hữu, thanh toán.
      throw new ApiError(405,'ACTION_NOT_ENABLED');
    }catch(error){
      if(error instanceof ApiError)return respond(error.status,{error:error.code});
      // Không đưa chuỗi SQL, thông tin cá nhân hoặc khóa vào phản hồi.
      return respond(503,{error:'SERVICE_UNAVAILABLE'});
    }
  };
  // Public synthetic Founder preview may query only this read-only access check.
  // No cookies, wildcard origin, service-role key or cross-origin business endpoints.
  return async function handleWithFounderCors(request) {
    const origin = request.headers.get('origin');
    const path = new URL(request.url).pathname;
    const permitted = path === '/v1/founder/access' &&
      (origin === 'https://bizviora-synthetic-demo.onrender.com' ||
       origin === 'https://bizviora.com');
    if (request.method === 'OPTIONS') {
      const preflightMethod = request.headers.get('access-control-request-method');
      const preflightHeaders = (request.headers.get('access-control-request-headers') || '')
        .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      if (!permitted || preflightMethod !== 'GET' ||
        preflightHeaders.some(h => !['authorization','content-type'].includes(h)))
        return respond(403,{error:'CORS_ORIGIN_DENIED'});
      return new Response(null,{status:204,headers:{
        'Access-Control-Allow-Origin':origin,
        'Access-Control-Allow-Methods':'GET',
        'Access-Control-Allow-Headers':'authorization, content-type',
        'Access-Control-Max-Age':'300',
        'Vary':'Origin',
        'Cache-Control':'no-store'
      }});
    }
    const response = await handleInternal(request);
    if (!permitted || request.method !== 'GET') return response;
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin',origin);
    headers.set('Vary','Origin');
    return new Response(response.body,{status:response.status,headers});
  };
}
