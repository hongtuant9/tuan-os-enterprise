import http from 'node:http';
import {jwtVerify,createRemoteJWKSet} from 'jose';
import {createApi} from '../core/src/api.mjs';
import {ApiError,requireUuid} from '../core/src/access.mjs';
import {localRepository,closeDb} from './pg-adapter.mjs';

const issuer='http://127.0.0.1:18093/realms/bizviora-phase1';
const jwks='http://auth:8080/realms/bizviora-phase1/protocol/openid-connect/certs';
if(process.env.BV_PHASE1_ACK!=='ISOLATED_SYNTHETIC_ONLY' ||
   process.env.BV_JWT_ISSUER!==issuer ||
   process.env.BV_JWKS_URL!==jwks ||
   process.env.BV_JWT_CLIENT_ID!=='bizviora-phase1-qa')
 throw Error('SELFHOST_IDENTITY_CONFIGURATION_DENIED');
const keySet=createRemoteJWKSet(new URL(jwks));
async function verifyBearer(token){
 try{
  const {payload}=await jwtVerify(token,keySet,{issuer,algorithms:['RS256'],clockTolerance:'10s'});
  if(payload.azp!=='bizviora-phase1-qa'||payload.typ!=='Bearer')
    throw Error('UNEXPECTED_TOKEN_CLIENT');
  // jwtVerify checks expiration when present; require exp/iat to reject
  // incorrectly minted or long-lived tokens, even when signed by our realm.
  const now=Math.floor(Date.now()/1000);
  if(!Number.isInteger(payload.exp) || !Number.isInteger(payload.iat) ||
     payload.iat>now+10 || payload.exp<=now ||
     payload.exp<=payload.iat || payload.exp-payload.iat>900)
    throw Error('JWT_TIME_CLAIMS_INVALID');
  return {id:requireUuid(payload.sub,'user_id')};
 }catch(error){
  // Synthetic QA only: classify validation failures without logging tokens,
  // usernames, credentials, claims, or raw exception messages.
  const code=String(error?.code||error?.name||'UNKNOWN').replace(/[^A-Z_0-9]/gi,'').slice(0,48);
  console.warn('QA_AUTH_VALIDATION_DENIED_CODE',code);
  throw new ApiError(401,'AUTH_INVALID');
 }
}
const api=createApi({verifyBearer,repository:localRepository});
const server=http.createServer(async(incoming,outgoing)=>{
 try{
  const method=incoming.method||'GET';
  const url='http://localhost'+(incoming.url||'/');
  // Health confirms isolated deployment identity, not operational readiness.
  if(method==='GET' && new URL(url).pathname==='/health'){
   outgoing.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
   outgoing.end(JSON.stringify({status:'UP',scope:'SELF_HOSTED_PHASE1_SYNTHETIC',production:false}));
   return;
  }
  const headers=new Headers();
  for(const [key,value] of Object.entries(incoming.headers))
   if(typeof value==='string')headers.set(key,value);
  const hasBody=method!=='GET'&&method!=='HEAD';
  const req=new Request(url,{method,headers,...(hasBody?{body:incoming,duplex:'half'}:{})});
  const res=await api(req);
  outgoing.writeHead(res.status,Object.fromEntries(res.headers.entries()));
  outgoing.end(Buffer.from(await res.arrayBuffer()));
 }catch{
  outgoing.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});
  outgoing.end('{"error":"SERVICE_UNAVAILABLE"}');
 }
});
server.listen(8080,'0.0.0.0');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{
 server.close();await closeDb();process.exit(0);
});
