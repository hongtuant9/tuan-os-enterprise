import test from 'node:test';
import assert from 'node:assert/strict';
const originalFetch=globalThis.fetch;
const originalArgv=process.argv;
const originalEnv={...process.env};
const validHealth={scope:'SELF_HOSTED_PHASE1_SYNTHETIC',production:false};
let serial=0;
async function run({base='http://127.0.0.1:18104',mode='preflight',tokens={},health=validHealth,redirect=false}={}){
 process.env.BIZV_QA_API_BASE=base;
 for(const [key,value] of Object.entries({FOUNDER:'',APPLICANT_A:'',APPLICANT_B:'',...tokens}))process.env['BIZV_QA_'+key+'_JWT']=value;
 process.argv=['node','test',mode];
 const calls=[];
 globalThis.fetch=async(url,options)=>{
  calls.push({url,options});
  assert.equal(options.redirect,'error');
  assert.ok(options.signal instanceof AbortSignal);
  if(redirect)throw new TypeError('redirect disallowed');
  return new Response(JSON.stringify(url.endsWith('/health')?health:{}),{status:url.endsWith('/health')?200:401});
 };
 try{
  const {main}=await import('./founder-ovh-jwt.e2e.mjs?test='+serial++);
  let error;try{await main()}catch(e){error=e}
  return {calls,error};
 }finally{globalThis.fetch=originalFetch;process.argv=originalArgv;process.env={...originalEnv}}
}
test('invalid origins and modes perform zero requests',async()=>{
 for(const base of ['https://127.0.0.1:18104','http://example.com:18104','http://127.0.0.1:80','http://u:p@127.0.0.1:18104','http://127.0.0.1:18104/path','http://127.0.0.1:18104/?q=1','http://127.0.0.1:18104/#fragment']){
  const r=await run({base});assert.ok(r.error);assert.equal(r.calls.length,0);
 }
 const r=await run({mode:'unexpected'});assert.ok(r.error);assert.equal(r.calls.length,0);
});
test('preflight rejects supplied tokens and execute rejects missing tokens before I/O',async()=>{
 for(const config of [{tokens:{FOUNDER:'synthetic-token'}},{mode:'execute'}]){
  const r=await run(config);assert.ok(r.error);assert.equal(r.calls.length,0);
 }
});
test('preflight only requests health and anonymous access',async()=>{
 const r=await run();assert.ifError(r.error);assert.equal(r.calls.length,2);
 for(const c of r.calls){assert.equal(c.options.method,'GET');assert.equal(c.options.headers.authorization,undefined)}
});
test('wrong health identity prevents authenticated traffic',async()=>{
 for(const health of [{}, {...validHealth,production:true},{...validHealth,scope:'PRODUCTION'}]){
  const r=await run({mode:'execute',tokens:{FOUNDER:'x'.repeat(40),APPLICANT_A:'a'.repeat(40),APPLICANT_B:'b'.repeat(40)},health});
  assert.ok(r.error);assert.equal(r.calls.length,1);assert.equal(r.calls[0].options.headers.authorization,undefined);
 }
});
test('redirect rejection stops runner immediately',async()=>{
 const r=await run({redirect:true});assert.ok(r.error);assert.equal(r.calls.length,1);
});
