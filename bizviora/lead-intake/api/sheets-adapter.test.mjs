import assert from 'node:assert/strict';
import {googleSheetsAdapter} from './sheets-adapter.mjs';
let checked=false;
const append=googleSheetsAdapter({spreadsheetId:'SYNTHETIC',getToken:async()=> 'FAKE-TEST-TOKEN',
fetchImpl:async(url,opts)=>{
assert(url.includes('sheets.googleapis.com'));
assert(url.includes('valueInputOption=RAW'));
assert.equal(opts.method,'POST');
const v=JSON.parse(opts.body).values[0];
assert.equal(v.length,20);assert.equal(v[0],'SYN-1');assert.equal(v[14],'bizviora-lead-v1');
checked=true;
return {ok:true,json:async()=>({updates:{updatedRows:1,updatedCells:20,updatedRange:'LEADS!A2:T2'}})};
}});
const r=await append({leadId:'SYN-1',timestamp:'2026-10-12T00:00:00Z',consentTimestamp:'2026-10-12T00:00:00Z',consentVersion:'bizviora-lead-v1',source:'synthetic',business:'Test',kind:'homestay',contact:'Fake',email:'synthetic@example.invalid',phone:'',pain:'QA'});
assert.equal(r.updatedRange,'LEADS!A2:T2');assert(checked);
const broken=googleSheetsAdapter({spreadsheetId:'SYNTHETIC',getToken:async()=>'FAKE',fetchImpl:async()=>({ok:false,status:503})});
await assert.rejects(()=>broken({}),/sheets_append_failed/);
console.log('PASS: mocked Google Sheets HTTP append contract; no actual Sheets request or write.');
