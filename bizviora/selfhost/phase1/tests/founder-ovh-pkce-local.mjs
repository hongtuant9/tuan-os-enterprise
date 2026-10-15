// Local-only browser Authorization Code + PKCE for the three existing synthetic QA users.
// No tokens, passwords or authorization codes are printed or written to disk.
import {createServer} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {main as runE2E} from './founder-ovh-jwt.e2e.mjs';
const auth='http://127.0.0.1:18103';
const callback='http://127.0.0.1:18106/callback';
const client=process.env.BIZV_QA_PKCE_CLIENT_ID||'bizviora-founder-qa-pkce';
const expected=['bv-founder-qa-20261015','bv-applicant-a-qa-20261015','bv-applicant-b-qa-20261015'];
const targets=['founder','a','b'];
const b64=x=>Buffer.from(x).toString('base64url');
function fail(msg){throw Error(msg)}
async function json(url,options){
 const r=await fetch(url,options);if(!r.ok)fail('OIDC_HTTP_'+r.status);
 return r.json();
}
async function acquire(username){
 const verifier=b64(randomBytes(48)),state=b64(randomBytes(24)),nonce=b64(randomBytes(24));
 const challenge=b64(createHash('sha256').update(verifier).digest());
 const local=new URL(callback);
 let close;
 const done=new Promise((resolve,reject)=>{
  const server=createServer(async(req,res)=>{
   try{
    const u=new URL(req.url,callback);
    if(u.pathname!==local.pathname||u.searchParams.get('state')!==state)fail('OIDC_CALLBACK_INVALID');
    if(u.searchParams.has('error'))fail('OIDC_AUTHORIZATION_DENIED');
    const code=u.searchParams.get('code');if(!code)fail('OIDC_CODE_ABSENT');
    res.writeHead(200,{'content-type':'text/plain','cache-control':'no-store'});
    res.end('BIZVIORA QA authentication received. You can close this tab.');
    resolve(code);
   }catch(e){res.writeHead(400);res.end('QA callback rejected');reject(e)}
   finally{server.close()}
  });
  server.on('error',reject);
  server.listen(18106,'127.0.0.1');
  close=()=>server.close();
 });
 try{
  const p=new URL(auth+'/realms/bizviora-phase1/protocol/openid-connect/auth');
  for(const [key,value] of Object.entries({client_id:client,redirect_uri:callback,response_type:'code',scope:'openid',state,nonce,code_challenge:challenge,code_challenge_method:'S256',prompt:'login',login_hint:username}))p.searchParams.set(key,value);
  console.log('OPEN_BROWSER_FOR '+username);
  spawn('open',[p.href],{stdio:'ignore'}).unref();
  const code=await Promise.race([done,new Promise((_,reject)=>setTimeout(()=>reject(Error('QA_LOGIN_TIMEOUT')),180000))]);
  const result=await json(auth+'/realms/bizviora-phase1/protocol/openid-connect/token',{
   method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({grant_type:'authorization_code',client_id:client,redirect_uri:callback,code,code_verifier:verifier})
  });
  if(!result.access_token)fail('OIDC_ACCESS_TOKEN_ABSENT');
  const payload=JSON.parse(Buffer.from(result.access_token.split('.')[1],'base64url').toString('utf8'));
  if(payload.iss!==auth+'/realms/bizviora-phase1'||typeof payload.sub!=='string')fail('OIDC_ISSUER_OR_SUBJECT_MISMATCH');
  const expectedIds={'bv-founder-qa-20261015':'b8ce8b92-31a5-49aa-9264-0d08abd5fc4e','bv-applicant-a-qa-20261015':'0c6e0568-2aa0-4283-8c64-50f7d4c462d7','bv-applicant-b-qa-20261015':'15b42f7e-95ea-4b6e-aa83-6cdc6aac0f3a'};
  if(payload.sub!==expectedIds[username]||payload.azp!==client||payload.exp<=Date.now()/1000+60)fail('OIDC_CLAIMS_VALIDATION_FAILED');
  console.log('PASS OIDC_IDENTITY '+username);
  return result.access_token;
 }finally{close?.()}
}
async function main(){
 const mode=process.argv[2];
 if(!['auth-only','execute'].includes(mode))fail('Use auth-only first; execute only after separate Founder grant approval');
 const cfg=await json(auth+'/realms/bizviora-phase1/.well-known/openid-configuration');
 if(!cfg.code_challenge_methods_supported?.includes('S256'))fail('PKCE_S256_UNAVAILABLE');
 const tokens={};
 for(let i=0;i<3;i++)tokens[targets[i]]=await acquire(expected[i]);
 if(mode==='auth-only'){
  const api='http://127.0.0.1:18104/v1/founder/access';
  for(const key of ['founder','a','b']){
   const result=await fetch(api,{headers:{authorization:'Bearer '+tokens[key]}});
   if(result.status!==403)fail('AUTH_ONLY_EXPECTED_DENIAL_'+key+'_HTTP_'+result.status);
   console.log('PASS JWT_SIGNATURE_ACCEPTED_FOUNDERSHIP_DENIED '+key);
  }
  console.log('PASS ALL_THREE_PKCE_USERS_AUTHENTICATED_AND_DENIED_WITH_ZERO_FOUNDER_GRANTS');
  return;
 }
 await runE2E(tokens);
}
main().catch(e=>{console.error('FAIL '+String(e.message).replace(/[A-Za-z0-9_-]{45,}/g,'[REDACTED]'));process.exitCode=1});
