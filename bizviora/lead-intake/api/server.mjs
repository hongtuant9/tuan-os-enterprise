// Isolated Render staging service. Safe-by-default: no Google credentials => 503.
import http from 'node:http';
import { createLeadHandler } from './lead.mjs';
import { googleSheetsAdapter } from './sheets-adapter.mjs';
const port=Number(process.env.PORT||10000);
const allowed=process.env.LEAD_ALLOWED_ORIGIN||'';
const stageToken=process.env.LEAD_STAGING_TOKEN||'';
const sheetId=process.env.LEAD_SPREADSHEET_ID||'';
const accessToken=process.env.GOOGLE_SHEETS_ACCESS_TOKEN||'';
const maxBytes=8000;
const activity=new Map();
function allow(key) {
  if (!key) return false;
  const now=Date.now();
  const hits=(activity.get(key)||[]).filter(t=>now-t<60_000);
  if (hits.length>=5) return false;
  hits.push(now);activity.set(key,hits);
  if(activity.size>2000) for(const [k,v] of activity) if(v.at(-1)<now-60_000) activity.delete(k);
  return true;
}
const configured=Boolean(allowed&&stageToken&&sheetId&&accessToken);
const appendLead=configured?googleSheetsAdapter({
  spreadsheetId:sheetId,
  getToken:async()=>accessToken
}):async()=>{throw Error('not_configured')};
const handler=createLeadHandler({appendLead,rateLimit:allow});
function reply(res,status,body){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(body));
}
http.createServer((req,res)=>{
 if(req.url==='/healthz'&&req.method==='GET') return reply(res,200,{ok:true,mode:'staging',intakeReady:configured});
 if(req.url!=='/api/leads') return reply(res,404,{error:'not_found'});
 if(!configured) return reply(res,503,{error:'not_configured'});
 if(req.method!=='POST') return reply(res,405,{error:'method_not_allowed'});
 if(req.headers.origin!==allowed) return reply(res,403,{error:'origin_denied'});
 if(req.headers['x-staging-token']!==stageToken) return reply(res,403,{error:'staging_only'});
 const type=(req.headers['content-type']||'').split(';')[0].trim();
 if(type!=='application/json') return reply(res,415,{error:'json_required'});
 let chunks='',bytes=0,aborted=false;
 req.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes){aborted=true;req.destroy();}else chunks+=chunk;});
 req.on('end',async()=>{
  if(aborted) return;
  let body;try{body=JSON.parse(chunks)}catch{return reply(res,400,{error:'invalid_json'})}
  const outcome=await handler({method:'POST',isJson:true,bytes,rateKey:req.socket.remoteAddress,body});
  reply(res,outcome.status,outcome.body);
 });
 req.on('error',()=>{if(!res.headersSent) reply(res,400,{error:'bad_request'});});
}).listen(port,'0.0.0.0',()=>console.log('BIZVIORA staging lead gateway listening on '+port+' ready='+configured));
