import { ApiError, requireUuid, requireMembership, validateTaskInput } from './access.mjs';

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
export function createApi({verifyBearer,repository}) {
  if(typeof verifyBearer!=='function'||typeof repository!=='function')
    throw new Error('AUTH_AND_REPOSITORY_REQUIRED');
  return async function handle(request) {
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
      const payload=request.method==='POST'?await readBody(request):null;
      const tenantId=requireUuid(request.method==='GET'?searchParams.get('tenantId'):payload?.tenantId,'tenant_id');
      const repo=repository(token);
      const membership=await repo.membership({tenantId,userId:user.id});
      const actor=requireMembership({userId:user.id,tenantId,membership,
        minRole:request.method==='POST'?'manager':'staff'});
      if(pathname==='/v1/context'&&request.method==='GET') {
        const data=await repo.context(actor);
        return respond(200,{tenant:data.tenant,businessUnits:data.businessUnits,properties:data.properties,role:actor.role});
      }
      if(pathname==='/v1/tasks'&&request.method==='GET')
        return respond(200,{tenantId,data:await repo.tasks(actor)});
      if(pathname==='/v1/tasks'&&request.method==='POST')
        return respond(201,{data:await repo.createTask(actor,validateTaskInput(payload))});
      if(pathname==='/v1/approvals'&&request.method==='GET')
        return respond(200,{tenantId,data:await repo.approvals(actor),writesEnabled:false});
      // Chưa mở thay đổi phê duyệt, tự gửi tin, tài chính chủ sở hữu, thanh toán.
      throw new ApiError(405,'ACTION_NOT_ENABLED');
    }catch(error){
      if(error instanceof ApiError)return respond(error.status,{error:error.code});
      // Không đưa chuỗi SQL, thông tin cá nhân hoặc khóa vào phản hồi.
      return respond(503,{error:'SERVICE_UNAVAILABLE'});
    }
  };
}
