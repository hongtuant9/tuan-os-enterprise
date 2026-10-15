import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,chmodSync,existsSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const source=readFileSync(new URL('./founder-qa-watchdog.sh',import.meta.url),'utf8');
function fixture(t,{own=0,other=0,fail=false,lock=false}={}){
 const dir=mkdtempSync(join(tmpdir(),'bv-watchdog-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const state=join(dir,'state'),bin=join(dir,'bin');mkdirSync(state);mkdirSync(bin);
 const db=join(dir,'db.json'),calls=join(dir,'calls');writeFileSync(db,JSON.stringify({own,other}));writeFileSync(calls,'');
 // Only change the state location in a copy; never repurpose HOME or run real Docker/flock.
 const needle='HOME_STATE="$HOME/.local/state/bizviora-founder-qa"';assert.equal(source.split(needle).length,2);
 writeFileSync(join(dir,'watchdog.sh'),source.replace(needle,'HOME_STATE="'+state+'"'));
 const docker=`#!${process.execPath}
const fs=require('node:fs');const args=process.argv.slice(2),sql=args.at(-1);
if(args[0]!=='exec'||args[1]!=='bizv20-founder-staging-qa-db-1'||!args.includes('psql'))process.exit(90);
fs.appendFileSync(${JSON.stringify(calls)},sql+'\\n');
if(${fail}){console.error('synthetic-sensitive-canary');process.exit(1)}
const path=${JSON.stringify(db)},data=JSON.parse(fs.readFileSync(path));
if(sql==='SELECT count(*) FROM bv_platform_managers;')console.log(data.own+data.other);
else if(sql===\"DELETE FROM bv_platform_managers WHERE user_id='b8ce8b92-31a5-49aa-9264-0d08abd5fc4e';\"){data.own=0;fs.writeFileSync(path,JSON.stringify(data));console.log('DELETE 1')}
else process.exit(91);
`;
 writeFileSync(join(bin,'docker'),docker);chmodSync(join(bin,'docker'),0o700);
 writeFileSync(join(bin,'flock'),'#!/bin/sh\nexit '+(lock?1:0)+'\n');chmodSync(join(bin,'flock'),0o700);
 return {state,deadline:join(state,'deadline'),db:()=>JSON.parse(readFileSync(db)),calls:()=>readFileSync(calls,'utf8'),
 run:mode=>spawnSync('/bin/bash',[join(dir,'watchdog.sh'),mode],{env:{PATH:bin+':/usr/bin:/bin'},encoding:'utf8',timeout:5000})};
}
test('arm from zero grants creates private deadline and never grants; repeated arm fails',t=>{
 const f=fixture(t);assert.equal(f.run('arm').status,0);assert.ok(Number(readFileSync(f.deadline))>Date.now()/1000);assert.equal(statSync(f.deadline).mode&0o777,0o600);
 assert.equal(f.run('arm').status,1);assert.doesNotMatch(f.calls(),/INSERT|UPDATE|DELETE/);
});
test('arm rejects existing grants without a marker',t=>{const f=fixture(t,{own:1});assert.equal(f.run('arm').status,1);assert.equal(existsSync(f.deadline),false)});
test('future deadline leaves grant and marker intact',t=>{const f=fixture(t,{own:1});writeFileSync(f.deadline,String(Math.floor(Date.now()/1000)+120));assert.equal(f.run('tick').status,0);assert.equal(f.db().own,1);assert.ok(existsSync(f.deadline));assert.doesNotMatch(f.calls(),/DELETE/)});
test('expired deadline revokes only exact Founder and removes marker',t=>{const f=fixture(t,{own:1});writeFileSync(f.deadline,'1000000000\n');assert.equal(f.run('tick').status,0);assert.equal(f.db().own,0);assert.equal(existsSync(f.deadline),false)});
for(const [name,value] of [['empty',''],['malformed','bad\n'],['leading zero','01000000000\n']])test(name+' deadline cannot retain a grant',t=>{
 const f=fixture(t,{own:1});writeFileSync(f.deadline,value);const r=f.run('tick');assert.equal(r.status,name==='leading zero'?0:1);assert.equal(f.db().own,0);assert.equal(existsSync(f.deadline),false);
});
test('missing marker with active grant revokes and reports anomaly',t=>{const f=fixture(t,{own:1});const r=f.run('tick');assert.equal(r.status,1);assert.match(r.stdout,/FAIL_MISSING_DEADLINE/);assert.equal(f.db().own,0)});
test('missing marker and zero grants is safe idle',t=>{const f=fixture(t);assert.equal(f.run('tick').status,0);assert.doesNotMatch(f.calls(),/DELETE/)});
test('unrelated grant is preserved and cleanup cannot claim PASS',t=>{const f=fixture(t,{own:1,other:1});writeFileSync(f.deadline,'1000000000\n');const r=f.run('tick');assert.equal(r.status,1);assert.deepEqual(f.db(),{own:0,other:1});assert.ok(existsSync(f.deadline));assert.doesNotMatch(r.stdout,/PASS FOUNDER/)});
test('database failure retains marker, fails, and redacts subprocess error',t=>{const f=fixture(t,{own:1,fail:true});writeFileSync(f.deadline,'1000000000\n');const r=f.run('tick');assert.equal(r.status,1);assert.ok(existsSync(f.deadline));assert.equal(f.db().own,1);assert.doesNotMatch(r.stdout+r.stderr,/synthetic-sensitive-canary|PASS/);assert.match(r.stderr,/FAIL QA_DATABASE_COMMAND/)});
test('lock failure prevents any database access',t=>{const f=fixture(t,{own:1,lock:true});assert.notEqual(f.run('revoke').status,0);assert.equal(f.calls(),'');assert.equal(f.db().own,1)});
test('status with active grant exits nonzero',t=>{const f=fixture(t,{own:1});assert.equal(f.run('status').status,1);assert.equal(f.db().own,1)});
