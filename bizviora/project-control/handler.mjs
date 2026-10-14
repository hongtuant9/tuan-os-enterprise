import {normalizeRoadmap,TASK_MASTER_RANGE} from './task-contract.mjs';
export const SHEET_ID='1uVG0L9FzcPBgOCk5IyWNuYVneCCgupqg-SH0TcERSjM';
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
// Dependency injection keeps JWT verification and Google credential acquisition server-only.
export function createProjectControlHandler({verifyUser,verifyPlatformManager,readSheet}){
 if (![verifyUser,verifyPlatformManager,readSheet].every(f=>typeof f==='function')) throw Error('MISSING_AUTHORIZED_DEPENDENCY');
 return async function handle(request){
  if(request.method!=='GET')return json(405,{error:'METHOD_NOT_ALLOWED'});
  const h=request.headers.get('authorization')||'';
  const token=/^Bearer ([A-Za-z0-9._~-]{12,4096})$/.exec(h)?.[1];
  if(!token)return json(401,{error:'AUTH_REQUIRED'});
  let user;
  try{user=await verifyUser(token)}catch{return json(401,{error:'AUTH_INVALID'})}
  if(!user?.id)return json(401,{error:'AUTH_INVALID'});
  let authorized=false;
  try{authorized=await verifyPlatformManager(token,user.id)===true}catch{}
  if(!authorized)return json(403,{error:'PLATFORM_MANAGER_REQUIRED'});
  try{
   const rows=await readSheet({spreadsheetId:SHEET_ID,range:TASK_MASTER_RANGE});
   return json(200,normalizeRoadmap(rows));
  }catch{return json(503,{error:'SOURCE_UNAVAILABLE'})}
 };
}
